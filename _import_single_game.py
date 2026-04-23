#!/usr/bin/env python3
import http.client
import json

BASE_URL = 'baseai-hk-default-rtdb.asia-southeast1.firebasedatabase.app'

game_data = {
    'date': '2026-03-08',
    'away_team': 'Kaakiro Lions Majors',
    'home_team': 'TTBC Majors Eagles',
    'away_score': 2,
    'home_score': 9,
    'venue': 'Unknown',
    'away_code': 'KKRL',
    'home_code': 'TTBC',
    'innings': {
        'away': ['0','0','0','1','0','1'],
        'home': ['0','2','4','0','3','X']
    },
    'hk_batting': [
        {'name': 'I Chan', 'number': 18, 'pos': 'SS', 'ab': 3, 'r': 0, 'h': 1, 'rbi': 0, 'bb': 0, 'so': 1},
        {'name': 'D Lau', 'number': 32, 'pos': '3B', 'ab': 3, 'r': 0, 'h': 1, 'rbi': 0, 'bb': 1, 'so': 1},
        {'name': 'Bi', 'number': 50, 'pos': 'P', 'ab': 3, 'r': 0, 'h': 2, 'rbi': 1, 'bb': 1, 'so': 0},
        {'name': 'M Mai', 'number': 22, 'pos': '1B', 'ab': 3, 'r': 0, 'h': 0, 'rbi': 0, 'bb': 1, 'so': 2},
        {'name': 'E Luo', 'number': 77, 'pos': '2B', 'ab': 3, 'r': 1, 'h': 1, 'rbi': 0, 'bb': 0, 'so': 2},
        {'name': 'J Liu', 'number': 11, 'pos': 'RF', 'ab': 2, 'r': 0, 'h': 0, 'rbi': 0, 'bb': 0, 'so': 1},
        {'name': 'W Wei', 'number': 3, 'pos': '1B', 'ab': 1, 'r': 0, 'h': 0, 'rbi': 0, 'bb': 0, 'so': 1},
        {'name': 'O Chan', 'number': 8, 'pos': 'CF', 'ab': 1, 'r': 1, 'h': 0, 'rbi': 0, 'bb': 2, 'so': 0},
        {'name': 'Teresa', 'number': 46, 'pos': 'RF', 'ab': 0, 'r': 0, 'h': 0, 'rbi': 0, 'bb': 0, 'so': 0},
        {'name': 'Vincent', 'number': 7, 'pos': 'C', 'ab': 3, 'r': 0, 'h': 3, 'rbi': 1, 'bb': 0, 'so': 0},
        {'name': 'K Li', 'number': 59, 'pos': 'LF', 'ab': 0, 'r': 0, 'h': 0, 'rbi': 0, 'bb': 1, 'so': 0},
        {'name': 'Anson', 'number': 2, 'pos': 'LF', 'ab': 0, 'r': 0, 'h': 0, 'rbi': 0, 'bb': 1, 'so': 0},
    ],
    'hk_pitching': [
        {'name': 'Bi', 'number': 50, 'ip': 3.2, 'h': 9, 'r': 6, 'er': 6, 'bb': 0, 'so': 7, 'hr': 1},
        {'name': 'M Mai', 'number': 22, 'ip': 0.2, 'h': 2, 'r': 3, 'er': 3, 'bb': 2, 'so': 1, 'hr': 0},
        {'name': 'D Lau', 'number': 32, 'ip': 0.2, 'h': 0, 'r': 0, 'er': 0, 'bb': 1, 'so': 1, 'hr': 0},
    ],
    'home_batting': [
        {'name': 'Elijah M', 'number': 22, 'pos': 'RF', 'ab': 4, 'r': 1, 'h': 1, 'rbi': 0, 'bb': 0, 'so': 2},
        {'name': 'Franklin K', 'number': 59, 'pos': 'C', 'ab': 2, 'r': 1, 'h': 2, 'rbi': 0, 'bb': 1, 'so': 0},
        {'name': 'Kim H', 'number': 28, 'pos': 'SS', 'ab': 3, 'r': 1, 'h': 1, 'rbi': 0, 'bb': 0, 'so': 1},
        {'name': 'Annika L', 'number': 6, 'pos': 'P', 'ab': 3, 'r': 0, 'h': 0, 'rbi': 1, 'bb': 0, 'so': 1},
        {'name': 'Jake G', 'number': 10, 'pos': '1B', 'ab': 3, 'r': 3, 'h': 3, 'rbi': 2, 'bb': 0, 'so': 0},
        {'name': 'Anderson H', 'number': 19, 'pos': 'LF', 'ab': 3, 'r': 1, 'h': 3, 'rbi': 2, 'bb': 0, 'so': 0},
        {'name': 'Liam M', 'number': 4, 'pos': '3B', 'ab': 2, 'r': 2, 'h': 1, 'rbi': 0, 'bb': 1, 'so': 1},
        {'name': 'Kiran C', 'number': 9, 'pos': 'CF', 'ab': 2, 'r': 0, 'h': 0, 'rbi': 0, 'bb': 1, 'so': 2},
        {'name': 'Logan Y', 'number': 12, 'pos': '2B', 'ab': 3, 'r': 0, 'h': 0, 'rbi': 0, 'bb': 0, 'so': 2},
    ],
    'home_pitching': [
        {'name': 'Annika L', 'number': 6, 'ip': 3.0, 'h': 4, 'r': 0, 'er': 0, 'bb': 3, 'so': 2, 'hr': 0},
        {'name': 'Logan Y', 'number': 12, 'ip': 1.0, 'h': 2, 'r': 1, 'er': 1, 'bb': 1, 'so': 0, 'hr': 0},
        {'name': 'Franklin K', 'number': 59, 'ip': 2.0, 'h': 2, 'r': 1, 'er': 1, 'bb': 3, 'so': 6, 'hr': 0},
    ],
    'status': 'completed'
}

# Push to Firebase
conn = http.client.HTTPSConnection(BASE_URL, timeout=30)
payload = json.dumps({'message': 'Import GC PDF: KKRL vs TTBC Mar 8 2026', 'data': game_data})
conn.request('POST', '/games.json', payload, {'Content-Type': 'application/json'})
r = conn.getresponse()
result = json.loads(r.read())
print('Game push:', result)
game_id = result.get('name', '')

# Now sync player stats
if game_id:
    # Get all players
    conn.request('GET', '/players.json?print=pretty')
    r = conn.getresponse()
    players = json.loads(r.read())

    name_map = {}
    for pid, pdata in players.items():
        if isinstance(pdata, dict):
            name_map[pdata.get('name', '').lower()] = pid

    all_players_data = {}

    # Away batting
    for b in game_data['hk_batting']:
        name = b['name'].lower()
        if name not in all_players_data:
            all_players_data[name] = {'batting': {}, 'pitching': {}}
        for k in ['ab', 'r', 'h', 'rbi', 'bb', 'so']:
            all_players_data[name]['batting'][k] = all_players_data[name]['batting'].get(k, 0) + b.get(k, 0)

    # Away pitching
    for p in game_data['hk_pitching']:
        name = p['name'].lower()
        if name not in all_players_data:
            all_players_data[name] = {'batting': {}, 'pitching': {}}
        for k in ['ip', 'h', 'r', 'er', 'bb', 'so', 'hr']:
            all_players_data[name]['pitching'][k] = all_players_data[name]['pitching'].get(k, 0) + p.get(k, 0)

    # Home batting
    for b in game_data['home_batting']:
        name = b['name'].lower()
        if name not in all_players_data:
            all_players_data[name] = {'batting': {}, 'pitching': {}}
        for k in ['ab', 'r', 'h', 'rbi', 'bb', 'so']:
            all_players_data[name]['batting'][k] = all_players_data[name]['batting'].get(k, 0) + b.get(k, 0)

    # Home pitching
    for p in game_data['home_pitching']:
        name = p['name'].lower()
        if name not in all_players_data:
            all_players_data[name] = {'batting': {}, 'pitching': {}}
        for k in ['ip', 'h', 'r', 'er', 'bb', 'so', 'hr']:
            all_players_data[name]['pitching'][k] = all_players_data[name]['pitching'].get(k, 0) + p.get(k, 0)

    # Update each player
    updated = 0
    for name, stats in all_players_data.items():
        if name in name_map:
            pid = name_map[name]
            current_stats = players[pid].get('stats', {})
            current_batting = current_stats.get('batting', {})
            current_pitching = current_stats.get('pitching', {})

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

            conn2 = http.client.HTTPSConnection(BASE_URL, timeout=30)
            payload = json.dumps({'stats': new_stats})
            conn2.request('PATCH', f'/players/{pid}.json', payload, {'Content-Type': 'application/json'})
            r = conn2.getresponse()
            if r.status == 200:
                updated += 1
                print(f'Updated: {name}')

    print(f'\\nDone! Game ID: {game_id}, Updated players: {updated}')
