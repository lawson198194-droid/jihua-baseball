#!/usr/bin/env python3
"""
GC PDF 解析脚本 - 比赛数据导入到 Firebase
用法: python _import_gc_game.py <pdf_path>
"""
import pdfplumber
import http.client
import json
import re
import sys
import os
from datetime import datetime

# Firebase RTDB
BASE_URL = 'baseai-hk-default-rtdb.asia-southeast1.firebasedatabase.app'
GAMES_PATH = '/games.json'
PLAYERS_PATH = '/players.json'

def parse_gc_pdf(pdf_path):
    """解析 GC PDF，返回结构化数据"""
    with pdfplumber.open(pdf_path) as pdf:
        text = pdf.pages[0].extract_text()

    result = {
        'raw_text': text,
        'game_info': {},
        'innings': {},
        'batting': {'away': [], 'home': []},
        'pitching': {'away': [], 'home': []}
    }

    lines = text.strip().split('\n')

    # === 1. 解析标题行 (Line 1) ===
    # "Kaakiro Lions Majors 2 - 9 TTBC Majors Eagles"
    title_match = re.match(r'(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+)', lines[0])
    if title_match:
        result['game_info']['away_team'] = title_match.group(1).strip()
        result['game_info']['away_score'] = int(title_match.group(2))
        result['game_info']['home_score'] = int(title_match.group(3))
        result['game_info']['home_team'] = title_match.group(4).strip()

    # === 2. 解析日期行 (Line 2) ===
    # "Away Sunday March 08, 2026" 或 "Home Saturday April 12, 2026"
    date_line = lines[1]
    date_match = re.search(r'(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\w+)\s+(\d+),\s+(\d{4})', date_line)
    if date_match:
        month_map = {'January': 1, 'February': 2, 'March': 3, 'April': 4,
                     'May': 5, 'June': 6, 'July': 7, 'August': 8,
                     'September': 9, 'October': 10, 'November': 11, 'December': 12}
        month = month_map.get(date_match.group(2), 1)
        day = int(date_match.group(3))
        year = int(date_match.group(4))
        result['game_info']['date'] = f'{year:04d}-{month:02d}-{day:02d}'
        result['game_info']['venue'] = 'Unknown'

    # === 3. 解析逐局比分 ===
    # "1  2  3  4  5  6  R  H  E"
    # "KKRL 0  0  0  1  0  1  2  8  0"
    # "TTBC 0  2  4  0  3  X  9  11 1"
    innings_line = lines[2]
    away_innings = lines[3]
    home_innings = lines[4]

    # 提取客队名和比分
    away_match = re.match(r'(\w+)\s+([\dX]+)\s+([\dX]+)\s+([\dX]+)', away_innings)
    home_match = re.match(r'(\w+)\s+([\dX]+)\s+([\dX]+)\s+([\dX]+)', home_innings)

    if away_match and home_match:
        result['game_info']['away_code'] = away_match.group(1)
        result['game_info']['home_code'] = home_match.group(1)

        # 逐局分数
        away_scores = re.findall(r'\d+', away_match.group(2))
        home_scores = re.findall(r'\d+', home_match.group(2))

        result['innings']['away'] = away_scores
        result['innings']['home'] = home_scores

        # 总分
        result['game_info']['away_r'] = int(away_match.group(3))
        result['game_info']['away_h'] = int(away_match.group(4))
        result['game_info']['home_r'] = int(home_match.group(3))
        result['game_info']['home_h'] = int(home_match.group(4))

    # === 4. 解析打击数据 ===
    # 找到 BATTING 部分
    batting_start = text.find('BATTING')
    pitching_start = text.find('PITCHING')

    if batting_start > 0 and pitching_start > 0:
        batting_text = text[batting_start:pitching_start]
        batting_lines = batting_text.strip().split('\n')

        # 跳过表头行，找到数据行
        away_batting = []
        home_batting = []
        current_team = None

        for line in batting_lines[1:]:
            # 检测队伍切换
            if result['game_info'].get('away_team', '') in line and 'Totals' not in line:
                current_team = 'away'
            elif result['game_info'].get('home_team', '') in line and 'Totals' not in line:
                current_team = 'home'
            elif 'Totals' in line:
                current_team = None

            # 解析球员数据行
            # "I Chan #18 (SS)  3  0  1  0  0  1"
            player_match = re.match(
                r'([A-Za-z\s\.]+?)\s*#(\d+)\s*\(([A-Z]+)\)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)',
                line.strip()
            )
            if player_match and current_team:
                player_data = {
                    'name': player_match.group(1).strip(),
                    'number': int(player_match.group(2)),
                    'position': player_match.group(3),
                    'ab': int(player_match.group(4)),
                    'r': int(player_match.group(5)),
                    'h': int(player_match.group(6)),
                    'rbi': int(player_match.group(7)),
                    'bb': int(player_match.group(8)),
                    'so': int(player_match.group(9))
                }
                if current_team == 'away':
                    away_batting.append(player_data)
                else:
                    home_batting.append(player_data)

        result['batting']['away'] = away_batting
        result['batting']['home'] = home_batting

    # === 5. 解析投球数据 ===
    if pitching_start > 0:
        pitching_text = text[pitching_start:]
        pitching_lines = pitching_text.strip().split('\n')

        away_pitching = []
        home_pitching = []
        current_team = None

        for line in pitching_lines[1:]:
            # 检测队伍切换
            if result['game_info'].get('away_team', '') in line and 'Totals' not in line:
                current_team = 'away'
            elif result['game_info'].get('home_team', '') in line and 'Totals' not in line:
                current_team = 'home'
            elif 'Totals' in line:
                current_team = None

            # 解析投手数据
            # "Bi #50  3.2  9  6  6  0  7  1"
            pitcher_match = re.match(
                r'([A-Za-z\s\.]+?)\s*#(\d+)\s+([\d\.]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)',
                line.strip()
            )
            if pitcher_match and current_team:
                pitcher_data = {
                    'name': pitcher_match.group(1).strip(),
                    'number': int(pitcher_match.group(2)),
                    'ip': float(pitcher_match.group(3)),
                    'h': int(pitcher_match.group(4)),
                    'r': int(pitcher_match.group(5)),
                    'er': int(pitcher_match.group(6)),
                    'bb': int(pitcher_match.group(7)),
                    'so': int(pitcher_match.group(8)),
                    'hr': int(pitcher_match.group(9))
                }
                if current_team == 'away':
                    away_pitching.append(pitcher_data)
                else:
                    home_pitching.append(pitcher_data)

        result['pitching']['away'] = away_pitching
        result['pitching']['home'] = home_pitching

    return result

def push_to_firebase(data):
    """推送比赛数据到 Firebase"""
    conn = http.client.HTTPSConnection(BASE_URL, timeout=30)

    # 构造比赛数据
    game_data = {
        'date': data['game_info'].get('date', ''),
        'away_team': data['game_info'].get('away_team', ''),
        'home_team': data['game_info'].get('home_team', ''),
        'away_score': data['game_info'].get('away_score', 0),
        'home_score': data['game_info'].get('home_score', 0),
        'venue': data['game_info'].get('venue', 'Unknown'),
        'innings': data['innings'],
        'hk_batting': data['batting']['away'],
        'hk_pitching': data['pitching']['away'],
        'status': 'completed'
    }

    # 推送到 Firebase
    payload = json.dumps({'message': 'Import GC PDF game', 'data': game_data})
    conn.request('POST', GAMES_PATH, payload, {
        'Content-Type': 'application/json'
    })
    r = conn.getresponse()
    result = json.loads(r.read())

    if r.status in [200, 201]:
        game_id = result.get('name', '')
        print(f'✅ Game saved: {game_id}')
        return game_id
    else:
        print(f'❌ Error: {r.status} - {result}')
        return None

def sync_player_stats(data):
    """同步球员统计数据到 Firebase"""
    conn = http.client.HTTPSConnection(BASE_URL, timeout=30)

    # 获取所有球员
    conn.request('GET', PLAYERS_PATH + '?print=pretty')
    r = conn.getresponse()
    players = json.loads(r.read())

    # 建立名字到player_id的映射
    name_map = {}
    for pid, pdata in players.items():
        if isinstance(pdata, dict):
            name_map[pdata.get('name', '').lower()] = pid

    # 合并打击和投球数据
    all_players_data = {}

    # 客队打击
    for b in data['batting']['away']:
        name = b['name'].lower()
        if name not in all_players_data:
            all_players_data[name] = {'batting': {}, 'pitching': {}}
        for k in ['ab', 'r', 'h', 'rbi', 'bb', 'so']:
            all_players_data[name]['batting'][k] = all_players_data[name]['batting'].get(k, 0) + b.get(k, 0)

    # 客队投球
    for p in data['pitching']['away']:
        name = p['name'].lower()
        if name not in all_players_data:
            all_players_data[name] = {'batting': {}, 'pitching': {}}
        for k in ['ip', 'h', 'r', 'er', 'bb', 'so', 'hr']:
            val = p.get(k, 0)
            if k == 'ip':
                all_players_data[name]['pitching'][k] = all_players_data[name]['pitching'].get(k, 0) + val
            else:
                all_players_data[name]['pitching'][k] = all_players_data[name]['pitching'].get(k, 0) + val

    # 主队打击
    for b in data['batting']['home']:
        name = b['name'].lower()
        if name not in all_players_data:
            all_players_data[name] = {'batting': {}, 'pitching': {}}
        for k in ['ab', 'r', 'h', 'rbi', 'bb', 'so']:
            all_players_data[name]['batting'][k] = all_players_data[name]['batting'].get(k, 0) + b.get(k, 0)

    # 主队投球
    for p in data['pitching']['home']:
        name = p['name'].lower()
        if name not in all_players_data:
            all_players_data[name] = {'batting': {}, 'pitching': {}}
        for k in ['ip', 'h', 'r', 'er', 'bb', 'so', 'hr']:
            val = p.get(k, 0)
            if k == 'ip':
                all_players_data[name]['pitching'][k] = all_players_data[name]['pitching'].get(k, 0) + val
            else:
                all_players_data[name]['pitching'][k] = all_players_data[name]['pitching'].get(k, 0) + val

    # 更新每个球员的 stats
    updated = 0
    for name, stats in all_players_data.items():
        if name in name_map:
            pid = name_map[name]

            # 获取当前 stats
            current_stats = players[pid].get('stats', {})
            current_batting = current_stats.get('batting', {})
            current_pitching = current_stats.get('pitching', {})

            # 合并
            new_batting = {}
            for k in ['ab', 'r', 'h', 'rbi', 'bb', 'so']:
                new_batting[k] = current_batting.get(k, 0) + stats['batting'].get(k, 0)

            new_pitching = {}
            for k in ['ip', 'h', 'r', 'er', 'bb', 'so', 'hr']:
                new_pitching[k] = current_pitching.get(k, 0) + stats['pitching'].get(k, 0)

            new_stats = {
                'batting': new_batting,
                'pitching': new_pitching,
                'games': (current_stats.get('games', 0) or 0) + 1
            }

            # 推送更新
            payload = json.dumps({'stats': new_stats})
            conn.request('PATCH', f'{PLAYERS_PATH}/{pid}.json', payload, {
                'Content-Type': 'application/json'
            })
            r = conn.getresponse()
            if r.status == 200:
                updated += 1
                print(f'  ✅ {name}: {pid}')

    print(f'Updated {updated} players')
    return updated

def main():
    if len(sys.argv) < 2:
        print('Usage: python _import_gc_game.py <pdf_path>')
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f'File not found: {pdf_path}')
        sys.exit(1)

    print(f'Parsing: {pdf_path}')
    data = parse_gc_pdf(pdf_path)

    print('\n=== Game Info ===')
    print(json.dumps(data['game_info'], indent=2))

    print('\n=== Innings ===')
    print(json.dumps(data['innings'], indent=2))

    print('\n=== Batting (Away) ===')
    print(json.dumps(data['batting']['away'], indent=2))

    print('\n=== Pitching (Away) ===')
    print(json.dumps(data['pitching']['away'], indent=2))

    # 确认后推送
    confirm = input('\nPush to Firebase? (y/n): ')
    if confirm.lower() == 'y':
        game_id = push_to_firebase(data)
        if game_id:
            sync_player_stats(data)
            print(f'\n✅ Done! Game ID: {game_id}')
    else:
        print('Cancelled')

if __name__ == '__main__':
    main()
