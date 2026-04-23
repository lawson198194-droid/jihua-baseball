/**
 * Pitcher Training Tracker - Core Logic (English Version)
 */

// ===== Global Variables =====
const canvas = document.getElementById('strikeZoneCanvas');
const ctx = canvas.getContext('2d');

// ===== Global State =====
let spots = [];
let badSpots = [];
let strikeZoneX, strikeZoneY, strikeZoneWidth, strikeZoneHeight;
let largeZoneX, largeZoneY, largeZoneSize;
let totalPitchesOffset = 0; // Manual offset for totalPitches

// ===== Storage Key =====
const STORAGE_KEY = 'pitcher_training_history';

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('trainingDate').valueAsDate = new Date();
    drawStrikeZone();
    setupEventListeners();
    updateStats();
    loadHistoryList();
});

// ===== Draw Strike Zone =====
function drawStrikeZone() {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    largeZoneSize = Math.min(canvas.width, canvas.height) * 0.9;
    largeZoneX = (canvas.width - largeZoneSize) / 2;
    largeZoneY = (canvas.height - largeZoneSize) / 2;

    strikeZoneWidth = largeZoneSize * (2 / 3);
    strikeZoneHeight = largeZoneSize * (2 / 3);
    strikeZoneX = (canvas.width - strikeZoneWidth) / 2;
    strikeZoneY = (canvas.height - strikeZoneHeight) / 2;

    const smallZoneX = strikeZoneX;
    const smallZoneY = strikeZoneY;
    const smallZoneSize = strikeZoneWidth;
    const smallCellW = smallZoneSize / 3;
    const smallCellH = smallZoneSize / 3;

    // Outer zone background (gray - ball area)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(largeZoneX, largeZoneY, largeZoneSize, largeZoneSize);

    // Outer zone grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;

    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(largeZoneX, largeZoneY + i * (largeZoneSize / 3));
        ctx.lineTo(largeZoneX + largeZoneSize, largeZoneY + i * (largeZoneSize / 3));
        ctx.stroke();
    }

    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(largeZoneX + i * (largeZoneSize / 3), largeZoneY);
        ctx.lineTo(largeZoneX + i * (largeZoneSize / 3), largeZoneY + largeZoneSize);
        ctx.stroke();
    }

    // Strike zone background (green)
    ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
    ctx.fillRect(smallZoneX, smallZoneY, smallZoneSize, smallZoneSize);

    // Strike zone grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;

    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(smallZoneX, smallZoneY + i * smallCellH);
        ctx.lineTo(smallZoneX + smallZoneSize, smallZoneY + i * smallCellH);
        ctx.stroke();
    }

    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(smallZoneX + i * smallCellW, smallZoneY);
        ctx.lineTo(smallZoneX + i * smallCellW, smallZoneY + smallZoneSize);
        ctx.stroke();
    }

    // Strike zone border (red)
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 3;
    ctx.strokeRect(smallZoneX, smallZoneY, smallZoneSize, smallZoneSize);

    // Outer zone border (blue dashed)
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(largeZoneX, largeZoneY, largeZoneSize, largeZoneSize);
    ctx.setLineDash([]);

    // Labels for strike zone
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';

    const labels = [
        ['High-In', 'High-Mid', 'High-Out'],
        ['Mid-In', 'STRIKE', 'Mid-Out'],
        ['Low-In', 'Low-Mid', 'Low-Out']
    ];

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const x = smallZoneX + col * smallCellW + smallCellW / 2;
            const y = smallZoneY + row * smallCellH + smallCellH / 2;
            ctx.fillText(labels[row][col], x, y + 4);
        }
    }

    // Ball zone labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.font = '10px Arial';
    ctx.fillText('BALL (High)', canvas.width / 2, largeZoneY - 8);
    ctx.fillText('BALL (Low)', canvas.width / 2, largeZoneY + largeZoneSize + 15);
    ctx.fillText('OUT', largeZoneX - 12, canvas.height / 2);
    ctx.fillText('OUT', largeZoneX + largeZoneSize + 12, canvas.height / 2);

    // Draw saved spots
    spots.forEach((spot, index) => {
        drawSpot(spot.x, spot.y, '#2ecc71', index + 1);
    });

    badSpots.forEach((spot, index) => {
        drawSpot(spot.x, spot.y, '#e67e22', spots.length + index + 1);
    });
}

// ===== Draw Spot =====
function drawSpot(x, y, color = '#ff69b4', number = 1) {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(number.toString(), x, y + 4);
}

// ===== Canvas Click Handler =====
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const isInLargeZone = x >= largeZoneX && x <= largeZoneX + largeZoneSize &&
                          y >= largeZoneY && y <= largeZoneY + largeZoneSize;

    if (!isInLargeZone) return;

    const isInStrikeZone = x >= strikeZoneX && x <= strikeZoneX + strikeZoneWidth &&
                           y >= strikeZoneY && y <= strikeZoneY + strikeZoneHeight;

    if (isInStrikeZone) {
        spots.push({ x, y });
        // Auto increment goodBalls counter
        const strikesInput = document.getElementById('goodBalls');
        strikesInput.value = parseInt(strikesInput.value || 0) + 1;
    } else {
        // Ball zone: NO auto-increment, keep manual only
        badSpots.push({ x, y });
    }

    drawStrikeZone();
    updateStats();
});

// ===== Event Listeners =====
function setupEventListeners() {
    document.querySelectorAll('.btn-plus').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            // Special handling for totalPitches: adjust offset instead of value
            if (targetId === 'totalPitches') {
                totalPitchesOffset++;
                updateStats();
            } else {
                const target = document.getElementById(targetId);
                target.value = parseInt(target.value || 0) + 1;
                updateStats();
            }
        });
    });

    document.querySelectorAll('.btn-minus').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            // Special handling for totalPitches: adjust offset
            if (targetId === 'totalPitches') {
                totalPitchesOffset = Math.max(-999, totalPitchesOffset - 1);
                updateStats();
            } else {
                const target = document.getElementById(targetId);
                target.value = Math.max(0, parseInt(target.value || 0) - 1);
                updateStats();
            }
        });
    });

    ['goodBalls', 'badBalls', 'strikeouts', 'walks', 'hits', 'runs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateStats);
    });
    // totalPitches is computed, no input listener needed

    document.getElementById('clearSpots').addEventListener('click', () => {
        spots = [];
        badSpots = [];
        drawStrikeZone();
        updateStats();
    });

    document.getElementById('resetAll').addEventListener('click', () => {
        if (confirm('Reset all data?')) {
            document.getElementById('goodBalls').value = 0;
            document.getElementById('badBalls').value = 0;
            totalPitchesOffset = 0;
            document.getElementById('strikeouts').value = 0;
            document.getElementById('walks').value = 0;
            document.getElementById('hits').value = 0;
            document.getElementById('runs').value = 0;
            document.getElementById('pitcherName').value = '';
            document.getElementById('trainingName').value = '';
            document.getElementById('pitchType').value = '';

            spots = [];
            badSpots = [];
            drawStrikeZone();
            updateStats();
        }
    });

    document.getElementById('exportPDF').addEventListener('click', showPreview);
    document.getElementById('cancelPreview').addEventListener('click', closePreview);
    document.getElementById('downloadPDF').addEventListener('click', exportToPDF);
    document.getElementById('previewModal').addEventListener('click', (e) => {
        if (e.target.id === 'previewModal') closePreview();
    });

    // History buttons
    document.getElementById('toggleHistory').addEventListener('click', toggleHistory);
    document.getElementById('closeHistory').addEventListener('click', closeHistory);
    document.getElementById('historyModal').addEventListener('click', (e) => {
        if (e.target.id === 'historyModal') closeHistory();
    });

    // Save training button
    document.getElementById('saveTraining').addEventListener('click', saveTraining);
}

// ===== Update Stats =====
function updateStats() {
    const goodBalls = parseInt(document.getElementById('goodBalls').value) || 0;
    const badBalls = parseInt(document.getElementById('badBalls').value) || 0;
    // Total = auto sum of goodBalls + badBalls + manual offset
    const autoTotal = goodBalls + badBalls;
    const totalPitches = autoTotal + totalPitchesOffset;
    const strikeouts = parseInt(document.getElementById('strikeouts').value) || 0;
    const walks = parseInt(document.getElementById('walks').value) || 0;
    const hits = parseInt(document.getElementById('hits').value) || 0;
    const runs = parseInt(document.getElementById('runs').value) || 0;

    const goodBallRate = totalPitches > 0 ? ((goodBalls / totalPitches) * 100).toFixed(1) : 0;

    document.getElementById('totalPitches').value = totalPitches;
    document.getElementById('goodBallRate').textContent = goodBallRate + '%';
    document.getElementById('statStrikeouts').textContent = strikeouts;
    document.getElementById('statWalks').textContent = walks;
    document.getElementById('statHits').textContent = hits;
    document.getElementById('statRuns').textContent = runs;
    document.getElementById('markedPitches').textContent = `${spots.length}S / ${badSpots.length}B`;
}

// ===== Save Training =====
function saveTraining() {
    const trainingName = document.getElementById('trainingName').value || 'Training ' + new Date().toISOString().split('T')[0];
    const trainingDate = document.getElementById('trainingDate').value || new Date().toISOString().split('T')[0];
    const pitcherName = document.getElementById('pitcherName').value || 'Unknown';
    const pitchType = document.getElementById('pitchType').value || 'N/A';
    const goodBalls = parseInt(document.getElementById('goodBalls').value) || 0;
    const badBalls = parseInt(document.getElementById('badBalls').value) || 0;
    const totalPitches = parseInt(document.getElementById('totalPitches').value) || 0;
    const strikeouts = parseInt(document.getElementById('strikeouts').value) || 0;
    const walks = parseInt(document.getElementById('walks').value) || 0;
    const hits = parseInt(document.getElementById('hits').value) || 0;
    const runs = parseInt(document.getElementById('runs').value) || 0;

    const record = {
        id: Date.now(),
        trainingName,
        trainingDate,
        pitcherName,
        pitchType,
        goodBalls,
        badBalls,
        totalPitches,
        strikeouts,
        walks,
        hits,
        runs,
        spots: [...spots],
        badSpots: [...badSpots]
    };

    let history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    history.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    loadHistoryList();
    alert('Training saved successfully!');
}

// ===== Load History List =====
function loadHistoryList() {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const listContainer = document.getElementById('historyList');
    const recordCount = document.getElementById('recordCount');

    recordCount.textContent = history.length;

    if (history.length === 0) {
        listContainer.innerHTML = '<p style="color: #999; text-align: center; padding: 10px;">No records yet</p>';
        return;
    }

    const displayRecords = history.slice(0, 3);

    listContainer.innerHTML = displayRecords.map(record => `
        <div class="history-item" onclick="viewHistoryRecord(${record.id})">
            <div class="history-date">${record.trainingDate}</div>
            <div class="history-name">${record.trainingName}</div>
            <div class="history-stats">
                S: ${record.goodBalls} | B: ${record.badBalls} | K: ${record.strikeouts} | BB: ${record.walks || 0} | H: ${record.hits || 0}
            </div>
        </div>
    `).join('');

    if (history.length > 3) {
        listContainer.innerHTML += `<p style="color: #666; text-align: center; padding: 10px; font-size: 12px;">+ ${history.length - 3} more records (click to view details)</p>`;
    }
}

// ===== Toggle History =====
function toggleHistory() {
    const historyList = document.getElementById('historyList');
    const toggleBtn = document.getElementById('toggleHistory');

    if (historyList.style.display === 'none') {
        historyList.style.display = 'block';
        toggleBtn.innerHTML = 'Hide History (<span id="recordCount">' + (JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').length) + '</span>)';
    } else {
        historyList.style.display = 'none';
        toggleBtn.innerHTML = 'Show History (<span id="recordCount">' + (JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').length) + '</span>)';
    }
}

// ===== View History Record =====
function viewHistoryRecord(id) {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const record = history.find(r => r.id === id);

    if (!record) return;

    const detailContainer = document.getElementById('historyDetail');
    const totalPitches = record.totalPitches || (record.goodBalls + record.badBalls);
    const strikeRate = totalPitches > 0 ? ((record.goodBalls / totalPitches) * 100).toFixed(1) : 0;

    const miniCanvasId = 'miniCanvas_' + id;

    detailContainer.innerHTML = `
        <div style="display: flex; gap: 20px;">
            <div style="flex: 1;">
                <h3 style="color: #e74c3c; border-bottom: 2px solid #e74c3c; padding-bottom: 10px;">${record.trainingName}</h3>
                <p style="color: #666; margin-bottom: 15px;">
                    Pitcher: ${record.pitcherName} | Date: ${record.trainingDate} | Type: ${record.pitchType}
                </p>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Strikes</td><td style="padding: 8px; text-align: right; font-weight: bold;">${record.goodBalls}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Balls</td><td style="padding: 8px; text-align: right; font-weight: bold;">${record.badBalls}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Total Pitches</td><td style="padding: 8px; text-align: right; font-weight: bold;">${totalPitches}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Strike Rate</td><td style="padding: 8px; text-align: right; font-weight: bold; color: #27ae60;">${strikeRate}%</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Strikeouts</td><td style="padding: 8px; text-align: right; font-weight: bold;">${record.strikeouts}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Walks</td><td style="padding: 8px; text-align: right; font-weight: bold;">${record.walks || 0}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;">Hits</td><td style="padding: 8px; text-align: right; font-weight: bold;">${record.hits}</td></tr>
                    <tr><td style="padding: 8px; color: #e74c3c;">Runs</td><td style="padding: 8px; text-align: right; font-weight: bold; color: #e74c3c;">${record.runs}</td></tr>
                </table>
                <div style="margin-top: 15px; font-size: 12px; color: #666;">
                    <span style="color: #27ae60;">&#9679;</span> Strikes marked: ${record.spots ? record.spots.length : 0}
                    <span style="color: #e67e22; margin-left: 10px;">&#9679;</span> Balls marked: ${record.badSpots ? record.badSpots.length : 0}
                </div>
            </div>
            <div style="flex: 0 0 250px;">
                <h4 style="color: #e74c3c; text-align: center;">Strike Zone Map</h4>
                <canvas id="${miniCanvasId}" width="200" height="250" style="border: 1px solid #ddd; border-radius: 8px;"></canvas>
            </div>
        </div>
    `;

    setTimeout(() => {
        const miniCanvas = document.getElementById(miniCanvasId);
        if (miniCanvas) {
            const miniCtx = miniCanvas.getContext('2d');
            drawMiniStrikeZone(miniCtx, miniCanvas.width, miniCanvas.height, record.spots, record.badSpots);
        }
    }, 100);

    document.getElementById('historyModal').classList.add('active');
}

// ===== Draw Mini Strike Zone =====
function drawMiniStrikeZone(ctx, width, height, spotsArr, badSpotsArr) {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    const zoneSize = Math.min(width, height) * 0.85;
    const zoneX = (width - zoneSize) / 2;
    const zoneY = (height - zoneSize) / 2;
    const smallSize = zoneSize * (2 / 3);
    const smallX = (width - smallSize) / 2;
    const smallY = (height - smallSize) / 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(zoneX, zoneY, zoneSize, zoneSize);

    ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
    ctx.fillRect(smallX, smallY, smallSize, smallSize);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(zoneX, zoneY + i * (zoneSize / 3));
        ctx.lineTo(zoneX + zoneSize, zoneY + i * (zoneSize / 3));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(zoneX + i * (zoneSize / 3), zoneY);
        ctx.lineTo(zoneX + i * (zoneSize / 3), zoneY + zoneSize);
        ctx.stroke();
    }

    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.strokeRect(smallX, smallY, smallSize, smallSize);

    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.8)';
    ctx.strokeRect(zoneX, zoneY, zoneSize, zoneSize);
    ctx.setLineDash([]);

    if (spotsArr) {
        spotsArr.forEach((spot) => {
            ctx.beginPath();
            ctx.arc(spot.x * (width / 450), spot.y * (height / 580), 5, 0, Math.PI * 2);
            ctx.fillStyle = '#2ecc71';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }

    if (badSpotsArr) {
        badSpotsArr.forEach((spot) => {
            ctx.beginPath();
            ctx.arc(spot.x * (width / 450), spot.y * (height / 580), 5, 0, Math.PI * 2);
            ctx.fillStyle = '#e67e22';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }
}

// ===== Show History =====
function showHistory() {
    loadHistoryList();
    document.getElementById('historyModal').classList.add('active');
}

// ===== Close History =====
function closeHistory() {
    document.getElementById('historyModal').classList.remove('active');
}

// ===== Show Preview =====
function showPreview() {
    const modal = document.getElementById('previewModal');
    const preview = document.getElementById('pdfPreview');

    const pitcherName = document.getElementById('pitcherName').value || 'Unknown';
    const trainingName = document.getElementById('trainingName').value || 'Training Record';
    const pitchType = document.getElementById('pitchType').value || 'N/A';
    const trainingDate = document.getElementById('trainingDate').value || new Date().toISOString().split('T')[0];

    const goodBalls = parseInt(document.getElementById('goodBalls').value) || 0;
    const badBalls = parseInt(document.getElementById('badBalls').value) || 0;
    const totalPitches = parseInt(document.getElementById('totalPitches').value) || 0;
    const strikeouts = parseInt(document.getElementById('strikeouts').value) || 0;
    const walks = parseInt(document.getElementById('walks').value) || 0;
    const hits = parseInt(document.getElementById('hits').value) || 0;
    const runs = parseInt(document.getElementById('runs').value) || 0;
    const goodBallRate = totalPitches > 0 ? ((goodBalls / totalPitches) * 100).toFixed(1) : 0;

    const canvasData = canvas.toDataURL('image/png');

    preview.innerHTML = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <h1 style="text-align: center; color: #e74c3c; margin-bottom: 10px;">Pitcher Training Report</h1>
            <h2 style="text-align: center; margin-bottom: 15px;">${trainingName}</h2>

            <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 12px; color: #666;">
                <span>Pitcher: ${pitcherName}</span>
                <span>Date: ${trainingDate}</span>
                <span>Type: ${pitchType}</span>
            </div>

            <div style="display: flex; gap: 20px;">
                <div style="flex: 1;">
                    <div style="border: 2px solid #333; padding: 12px;">
                        <h3 style="margin-bottom: 10px; color: #e74c3c;">Statistics</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <tr><td style="padding: 6px;">Strikes</td><td style="padding: 6px; font-weight: bold; text-align: right;">${goodBalls}</td></tr>
                            <tr><td style="padding: 6px;">Balls</td><td style="padding: 6px; font-weight: bold; text-align: right;">${badBalls}</td></tr>
                            <tr><td style="padding: 6px;">Total Pitches</td><td style="padding: 6px; font-weight: bold; text-align: right;">${totalPitches}</td></tr>
                            <tr><td style="padding: 6px;">Strike Rate</td><td style="padding: 6px; font-weight: bold; text-align: right; color: #27ae60;">${goodBallRate}%</td></tr>
                            <tr><td style="padding: 6px;">Strikeouts</td><td style="padding: 6px; font-weight: bold; text-align: right;">${strikeouts}</td></tr>
                            <tr><td style="padding: 6px;">Walks</td><td style="padding: 6px; font-weight: bold; text-align: right;">${walks}</td></tr>
                            <tr><td style="padding: 6px;">Hits</td><td style="padding: 6px; font-weight: bold; text-align: right;">${hits}</td></tr>
                            <tr><td style="padding: 6px; color: #e74c3c;">Runs</td><td style="padding: 6px; font-weight: bold; text-align: right; color: #e74c3c;">${runs}</td></tr>
                        </table>
                    </div>
                    <div style="margin-top: 15px; text-align: center; color: #666; font-size: 12px;">
                        <span style="color: #27ae60;">&#9679;</span> Strikes: ${spots.length}
                        <span style="color: #e67e22; margin-left: 10px;">&#9679;</span> Balls: ${badSpots.length}
                    </div>
                </div>
                <div style="flex: 0 0 200px;">
                    <h3 style="margin-bottom: 8px; color: #e74c3c; text-align: center;">Strike Zone</h3>
                    <img src="${canvasData}" style="width: 100%; border: 1px solid #ddd; border-radius: 8px;" />
                    <div style="font-size: 10px; color: #999; text-align: center; margin-top: 5px;">
                        Red = Strike Zone | Blue = Ball Area
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');
}

// ===== Close Preview =====
function closePreview() {
    document.getElementById('previewModal').classList.remove('active');
}

// ===== Export PDF =====
function exportToPDF() {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let y = margin;

        const pitcherName = document.getElementById('pitcherName').value || 'Unknown';
        const trainingName = document.getElementById('trainingName').value || 'Training Record';
        const pitchType = document.getElementById('pitchType').value || 'N/A';
        const trainingDate = document.getElementById('trainingDate').value || new Date().toISOString().split('T')[0];

        const goodBalls = parseInt(document.getElementById('goodBalls').value) || 0;
        const badBalls = parseInt(document.getElementById('badBalls').value) || 0;
        const totalPitches = parseInt(document.getElementById('totalPitches').value) || 0;
        const strikeouts = parseInt(document.getElementById('strikeouts').value) || 0;
        const walks = parseInt(document.getElementById('walks').value) || 0;
        const hits = parseInt(document.getElementById('hits').value) || 0;
        const runs = parseInt(document.getElementById('runs').value) || 0;
        const goodBallRate = totalPitches > 0 ? ((goodBalls / totalPitches) * 100).toFixed(1) : 0;

        // Title
        doc.setFontSize(20);
        doc.setTextColor(231, 76, 60);
        doc.text('Pitcher Training Report', pageWidth / 2, y, { align: 'center' });
        y += 10;

        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text(trainingName, pageWidth / 2, y, { align: 'center' });
        y += 7;

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`Pitcher: ${pitcherName} | Date: ${trainingDate} | Type: ${pitchType}`, pageWidth / 2, y, { align: 'center' });
        y += 10;

        doc.setDrawColor(231, 76, 60);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;

        const statsX = margin;
        const statsW = 80;

        doc.setFontSize(12);
        doc.setTextColor(52, 152, 219);
        doc.text('Statistics', statsX, y);
        y += 6;

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);

        const stats = [
            ['Strikes', goodBalls],
            ['Balls', badBalls],
            ['Total Pitches', totalPitches],
            ['Strike Rate', goodBallRate + '%'],
            ['Strikeouts', strikeouts],
            ['Walks', walks],
            ['Hits', hits],
            ['Runs', runs]
        ];

        stats.forEach((s, i) => {
            if (i % 2 === 0) {
                doc.setFillColor(248, 248, 248);
                doc.rect(statsX, y - 3, statsW, 6, 'F');
            }
            doc.text(s[0], statsX + 3, y);
            const valColor = s[0] === 'Runs' ? [231, 76, 60] : [0, 0, 0];
            doc.setTextColor(...valColor);
            doc.text(String(s[1]), statsX + statsW - 3, y, { align: 'right' });
            doc.setTextColor(0, 0, 0);
            y += 6;
        });

        y += 3;
        doc.setFontSize(9);
        doc.setTextColor(46, 204, 113);
        doc.text(`Strike marks: ${spots.length}`, statsX, y);
        y += 5;
        doc.setTextColor(230, 126, 34);
        doc.text(`Ball marks: ${badSpots.length}`, statsX, y);
        y += 10;

        const imgX = margin + statsW + 10;
        const imgW = pageWidth - imgX - margin;
        const imgH = (canvas.height / canvas.width) * imgW;

        doc.setFontSize(12);
        doc.setTextColor(52, 152, 219);
        doc.text('Strike Zone', imgX, y);
        y += 4;

        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Red box = Strike Zone | Blue = Ball Area', imgX, y);
        y += 2;

        const canvasData = canvas.toDataURL('image/png');
        doc.addImage(canvasData, 'PNG', imgX, y, imgW, imgH);
        y += imgH + 5;

        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Generated by Pitcher Training Tracker', pageWidth / 2, 287, { align: 'center' });

        const fileName = `Training_Report_${trainingName}_${trainingDate}.pdf`;
        doc.save(fileName);

        closePreview();
    } catch (e) {
        console.error('PDF export error:', e);
        alert('PDF export failed. Please try again.');
    }
}
