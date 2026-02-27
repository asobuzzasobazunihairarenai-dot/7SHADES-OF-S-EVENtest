/**
 * 7 SHADES OF S:EVEN - Core Logic
 * 【共通定義】
 * - 到達: 表向きカードの上に駒が置かれた瞬間
 * - 到達効果: 到達時に発動。原則「効果解決」→「カード獲得」の順。
 * - 例外: カードに処遇（場に残る、破棄等）が書かれている場合はそれに従う。
 */
/**
 * game_utils.js
 * ログ、トースト、演出、計算など、汎用的なユーティリティ関数。
 * 修正：雷エフェクトのアニメーション終了後にSVG要素をクリアする処理を追加。
 */

function addLog(text) {
    const logEl = document.getElementById('log-area');
    if(!logEl) return;
    const row = document.createElement('div');
    row.textContent = `> ${text}`;
    logEl.insertBefore(row, logEl.firstChild);
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = "toast-msg bg-gray-800 text-white border border-yellow-500 px-4 py-2 rounded shadow-xl text-sm font-bold flex items-center gap-2";
    el.innerHTML = `<span class="text-yellow-500">⚠</span> ${msg}`;
    container.innerHTML = '';
    container.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 1500);
}

function showMessageOverlay(msg, duration, callback) {
    const el = document.createElement('div');
    el.className = "fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4";
    el.innerHTML = `<div class="bg-gray-800 border-2 border-yellow-500 p-6 rounded-xl text-center shadow-2xl max-w-xs animate-pulse">
        <p class="text-white font-bold text-sm whitespace-pre-wrap">${msg}</p>
    </div>`;
    document.body.appendChild(el);
    setTimeout(() => {
        el.remove();
        if(callback) callback();
    }, duration);
}

function togglePeek(isPeeking) {
    const modalIds = [
        'detail-modal', 'selection-modal', 'arrival-modal', 'discard-modal', 
        'player-detail-modal', 'test-mode-modal', 'settings-modal',
        'winner-overlay', 'result-overlay' 
    ];
    const peekBtn = document.getElementById('peek-board-container');
    const restoreBtn = document.getElementById('restore-modal-container');

    isPeekingMode = isPeeking;

    if (isPeeking) {
        // 現在開いているモーダルを探して ID を保存する
        activeModalId = modalIds.find(id => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden');
        });

        if (activeModalId) {
            document.getElementById(activeModalId).classList.add('hidden');
            if (peekBtn) peekBtn.classList.add('hidden');
            if (restoreBtn) restoreBtn.classList.remove('hidden');
        }
    } else {
        // 保存されていた ID のモーダルを再表示する
        if (activeModalId) {
            const el = document.getElementById(activeModalId);
            if (el) el.classList.remove('hidden');
            
            activeModalId = null;
            if (peekBtn) peekBtn.classList.remove('hidden');
            if (restoreBtn) restoreBtn.classList.add('hidden');
        }
    }
}

function managePeekUI(show) {
    const peekBtn = document.getElementById('peek-board-container');
    const fabContainer = document.getElementById('floating-actions');
    if (show) { 
        peekBtn.classList.remove('hidden'); 
        if (fabContainer) { fabContainer.classList.add('hidden'); }
    } else { 
        peekBtn.classList.add('hidden'); 
        if (fabContainer) { fabContainer.classList.remove('hidden'); }
    }
}

function triggerCellFlash(x, y, colorHex) {
    const boardEl = document.getElementById('board-grid');
    if (!boardEl) return;
    const cellEl = boardEl.children[y * GRID_SIZE + x];
    if (cellEl) {
        cellEl.classList.remove('cell-flash-active');
        void cellEl.offsetWidth; 
        cellEl.style.color = colorHex || '#ffffff';
        cellEl.classList.add('cell-flash-active');
        setTimeout(() => {
            cellEl.classList.remove('cell-flash-active');
        }, 800);
    }
}

function triggerArrivalRipple(x, y, colorHex) {
    const boardEl = document.getElementById('board-grid');
    if (!boardEl) return;
    const cellEl = boardEl.children[y * GRID_SIZE + x];
    if (cellEl) {
        // 色が指定されていない場合は白、rainbowの場合は金にする等の処理
        const effectColor = colorHex || '#ffffff';
        cellEl.style.setProperty('--ripple-color', effectColor);
        
        cellEl.classList.remove('ripple-active');
        void cellEl.offsetWidth; // リフロー
        cellEl.classList.add('ripple-active');
        
        // 演出が終わったらクラスを削除（1.3秒後に除去）
        setTimeout(() => {
            cellEl.classList.remove('ripple-active');
        }, 1300);
    }
}

function triggerLockEffect(playerId, colorId) {
    // 1. 効果音の再生
    if (typeof playSE === 'function') {
        playSE('se_lock_success.mp3'); 
    }

    isAutoProcessing = true;

    setTimeout(() => {
        const slotEl = document.getElementById(`p${playerId}-slot-${colorId}`);
        if (slotEl) {
            // --- 修正箇所：人数に応じた角度計算 ---
            let deg = 0;
            if (players.length === 2) {
                // 2人対戦の場合：P1=0, P2=180
                deg = (playerId === 2) ? 180 : 0;
            } else {
                // 3人・4人対戦の場合：90度刻み
                deg = (playerId - 1) * 90;
            }
            slotEl.style.setProperty('--target-deg', `${deg}deg`);
            // ------------------------------------

            const colorData = BASE_COLORS.find(c => c.id === colorId);
            if (colorData) {
                slotEl.style.setProperty('--ripple-color', colorData.hex);
            }

            slotEl.classList.remove('lock-flash-active');
            void slotEl.offsetWidth; 
            slotEl.classList.add('lock-flash-active');
        }

        setTimeout(() => {
            isAutoProcessing = false; 
            console.log("余韻終了：操作制限を解除します");
        }, 1000); 

    }, 50);
}

/**
 * 指定したマスを指定した色で一定時間（2秒）発光させる（3回点滅）
 * @param {number} x 座標
 * @param {number} y 座標
 * @param {string} colorHex 発光させる色の16進数コード
 * @returns {Promise} 演出終了時に解決するPromise
 */
function animateCellBlink(x, y, colorHex) {
    return new Promise(resolve => {
        const boardEl = document.getElementById('board-grid');
        if (!boardEl) return resolve();
        
        const cellEl = boardEl.children[y * GRID_SIZE + x];
        if (cellEl) {
            // 色をCSS変数として渡し、クラスを付与
            cellEl.style.setProperty('--blink-color', colorHex);
            cellEl.classList.add('generic-blink-animation');
            
            // 2秒後にクラスを削除してPromiseを解決
            setTimeout(() => {
                cellEl.classList.remove('generic-blink-animation');
                resolve();
            }, 2000);
        } else {
            resolve();
        }
    });
}



function triggerRainbowFlash(x, y) {
    const boardEl = document.getElementById('board-grid');
    if (!boardEl) return;
    const cellEl = boardEl.children[y * GRID_SIZE + x];
    if (cellEl) {
        cellEl.classList.add('rainbow-active');
        setTimeout(() => {
            cellEl.classList.remove('rainbow-active');
        }, 1000);
    }
}

function triggerLightningEffect() {
    const playThunderSound = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const master = ctx.createGain();
            master.gain.value = 0.3;
            master.connect(ctx.destination);
            const bufferSize = ctx.sampleRate * 1.5;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(500, ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 1.2);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
            noise.connect(filter); filter.connect(gain); gain.connect(master);
            noise.start(); noise.stop(ctx.currentTime + 1.5);
        } catch(e) {}
    };
    playThunderSound();
    const overlay = document.getElementById('lightning-overlay');
    if (!overlay) return;
    overlay.classList.remove('lightning-active');
    void overlay.offsetWidth; 
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.position = "absolute"; svg.style.inset = "0"; svg.style.width = "100%"; svg.style.height = "100%";
    const createBolt = (startX) => {
        const path = document.createElementNS(svgNS, "path");
        let x = startX || Math.random() * 80 + 10;
        let d = `M ${x} 0`;
        let curY = 0;
        while(curY < 100) {
            curY += Math.random() * 15 + 5;
            x += (Math.random() - 0.5) * 40;
            d += ` L ${x} ${curY}`;
            if(Math.random() > 0.7) {
                const branch = document.createElementNS(svgNS, "path");
                branch.setAttribute("d", `M ${x} ${curY} L ${x + (Math.random()-0.5)*30} ${curY + 15}`);
                branch.setAttribute("class", "bolt-path");
                branch.style.animationDelay = "0.1s";
                svg.appendChild(branch);
            }
        }
        path.setAttribute("d", d); path.setAttribute("class", "bolt-path");
        return path;
    };
    for(let i=0; i<3; i++) svg.appendChild(createBolt());
    overlay.innerHTML = ''; overlay.appendChild(svg);
    overlay.classList.add('lightning-active');
    
    // 修正箇所：アニメーション終了後にオーバーレイの中身を完全に消去する
    setTimeout(() => {
        overlay.classList.remove('lightning-active');
        overlay.innerHTML = ''; 
    }, 1200); // 既存の1200msを維持、または演出に合わせて微調整
}

function gainTime(seconds) {
    if (winner) return;

    // 現在の設定値（デバッグ設定等）を取得、なければデフォルトの15秒
    const maxPhaseTime = window.PHASE_TIME_SEC || 15;

    if (useGlobalTimer) {
        const p = players[turn];
        if (p) {
            const maxTimeSetting = parseInt(document.getElementById('setting-max-time')?.value || "180");
            // 全体時間制の場合は、ターン開始時の時間を上限とする既存ロジックを維持
            p.totalTimeLeft = Math.min(maxTimeSetting, timeAtTurnStart, p.totalTimeLeft + seconds);
        }
    } else {
        // ★修正：timeLeft（通常タイマー）の回復上限を厳格に適用
        timeLeft = Math.min(maxPhaseTime, timeLeft + seconds);
    }
    
    if (typeof updateTimerVisual === 'function') updateTimerVisual(); 
}

function getDistance(p1, p2) {
    return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
}

/**
 * ゲーム全体のBGM音量を変更する
 * @param {number} vol 0.0 から 1.0 の値
 */
function setBGMVolume(vol) {
    if (window.gameBGM) {
        window.gameBGM.volume = vol;
    }
}

/**
 * 設定画面のスライダー(0-100)からBGM音量を変更する
 * @param {string} valStr スライダーの値（文字列）
 */
function updateBGMVolumeFromSlider(valStr) {
    const vol = parseInt(valStr) / 100;
    // localStorageに保存して次回以降も維持
    localStorage.setItem('shades_bgm_volume', valStr);
    
    if (window.gameBGM) {
        window.gameBGM.volume = vol;
    }
}

/**
 * 効果音（SE）を再生する共通関数
 */
function playSE(fileName) {
    if (!fileName) return;

    // 正しいID（index.htmlで修正予定のID）から音量を取得
    const volSlider = document.getElementById('setting-se-volume');
    const vol = volSlider ? (parseInt(volSlider.value) / 100) : 0.5;

    // パスを audio/ に統一（外科手術的修正）
    try {
        const audio = new Audio(`audio/${fileName}`);
        audio.volume = vol;
        audio.play().catch(e => console.warn("SE playback failed:", e));
    } catch (err) {
        console.error("SE play error:", err);
    }
}

/**
 * 設定画面のスライダーから効果音の音量をテスト再生する
 * HTML側の oninput="updateSEVolumeFromSlider(this.value)" と完全に一致させます
 */
// 修正: スライダー操作時に音量を保存する機能を追加
function updateSEVolumeFromSlider(valStr) {
    localStorage.setItem('shades_se_volume', valStr);
    // テスト再生（動作確認用）
    playSE('se_arrival_trigger.mp3'); 
}