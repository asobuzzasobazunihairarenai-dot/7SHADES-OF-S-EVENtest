/**
 * 7 SHADES OF S:EVEN - game_utils.js
 * 【共通定義】
 * - 到達: 表向きカードの上に駒が置かれた瞬間
 * - 到達効果: 到達時に発動。原則「効果解決」→「カード獲得」の順。
 * - 例外: カードに処遇（場に残る、破棄等）が書かれている場合はそれに従う。
 */

/**
 * ログを表示する（デバッグフラグ対応版）
 * @param {string} text - 表示するテキスト
 * @param {boolean} isDebug - デバッグ用ログかどうか（任意）
 */
/* 2026/03/13 修正：ログのスタッキング機能（重複まとめ）を導入 */
let lastLogText = ""; // 直前に出したログを記憶
let lastLogCount = 1; // 重複回数
let lastLogRowElement = null; // 直前のログのDOM要素

function addLog(text, isDebug = false) {
    const logEl = document.getElementById('log-area');
    if(!logEl) return;

    const isForcedCpu = (typeof window.FORCED_CPU_MODE !== 'undefined' && window.FORCED_CPU_MODE);
    const isTest = (typeof isTestMode !== 'undefined' && isTestMode);

    /* 2026/03/14 修正：開発用ログの強制表示判定を追加 */
    const isDevLogForced = (typeof window.IS_DEV_LOG_FORCED !== 'undefined' && window.IS_DEV_LOG_FORCED);

    // デバッグログの時：観戦・テスト・強制表示 のいずれも当てはまらない場合のみ隠す
    if (isDebug && !isForcedCpu && !isTest && !isDevLogForced) {
        console.log("[DEBUG-HIDDEN]", text);
        return;
    }

    // --- 重複チェック ---
    if (text === lastLogText && lastLogRowElement) {
        lastLogCount++;
        
        // 10回連続で同じログ（特にタイムアウト系）が出たら異常とみなす
        if (lastLogCount >= 10 && (text.includes("タイムアウト") || text.includes("要請"))) {
            emergencyStop("タイムアウトが10回連続で発生しました。処理がループしている可能性があります。");
        }

        const countBadge = lastLogRowElement.querySelector('.log-count-badge');
        if (countBadge) {
            countBadge.textContent = `(x${lastLogCount})`;
        } else {
            const badge = document.createElement('span');
            badge.className = 'log-count-badge ml-2 text-[8px] bg-gray-700 text-gray-400 px-1 rounded';
            badge.textContent = `(x${lastLogCount})`;
            lastLogRowElement.appendChild(badge);
        }
        return; // 新しい行は作らずに終了
    }

    // 新しいログなのでリセット
    lastLogText = text;
    lastLogCount = 1;

    const highlights = [
        { key: /『(.*?)』/g, html: '<span class="bg-gray-900/50 text-cyan-300 font-bold px-1 rounded border border-cyan-500/30 shadow-[0_0_5px_rgba(34,211,238,0.4)]">$&</span>' },
        { key: /勝利|WIN|WINNER/g, html: '<span class="text-yellow-400 font-black italic drop-shadow-[0_0_3px_rgba(250,204,21,0.8)]">👑 $&</span>' },
        { key: /王手|リーチ/g, html: '<span class="text-orange-500 font-bold animate-pulse text-[11px]">🔥 $&</span>' },
        { key: /GATE INVASION|侵攻/g, html: '<span class="bg-red-600 text-white px-1 rounded font-black">⚠️ $&</span>' },
        { key: /\[PHASE\]/g, html: '<span class="border border-indigo-500/50 px-1 rounded text-[8px] opacity-70">$&</span>' },
        { key: /\[ERROR\](.*)/g, html: '<span class="bg-red-900 text-white font-black px-1 rounded animate-pulse">❌ $&</span>' },
        { key: /\[DEBUG\]/g, html: '<span class="text-gray-500 text-[8px] font-mono border border-gray-700 px-0.5 rounded">DEBUG</span>' }
    ];

    let highlightedText = text;
    highlights.forEach(h => { highlightedText = highlightedText.replace(h.key, h.html); });

    const row = document.createElement('div');
    if (isDebug) row.className = "opacity-70 text-[9px] italic border-l border-gray-700 pl-1 my-0.5";
    
    row.innerHTML = `<span class="opacity-50 mr-1">&gt;</span><span class="log-content">${highlightedText}</span>`;
    
    logEl.insertBefore(row, logEl.firstChild);
    lastLogRowElement = row; // この行を記憶

    if (logEl.children.length > 100) logEl.removeChild(logEl.lastChild);
    console.log(isDebug ? "[DEBUG]" : "[LOG]", text);
}

// 【外科手術的追加】ログエリアのクリック・拡大イベント
document.addEventListener('DOMContentLoaded', () => {
    const logArea = document.getElementById('log-area');
    const logOverlay = document.getElementById('log-history-overlay');
    const logContent = document.getElementById('log-history-content');
    const closeBtns = ['close-log-history', 'close-log-history-btn'];

    if (logArea) {
        // ログエリア全体をクリック可能にし、カーソルをポインタに変更
        logArea.style.cursor = 'pointer';
        logArea.title = 'クリックで履歴を表示';
        
        logArea.onclick = () => {
            if (!logOverlay || !logContent) return;
            // 現在のログをすべてコピーして拡大画面に入れる
            logContent.innerHTML = logArea.innerHTML;
            logOverlay.classList.remove('hidden');
        };
    }

    // 閉じるボタンの処理
    closeBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = () => logOverlay.classList.add('hidden');
    });
});

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

/**
 * 接触演出を実行する
 * @param {number} x - 発生源のX座標（グリッド）
 * @param {number} y - 発生源のY座標（グリッド）
 */
function playContactEffect(x, y) {
    // 1. 画面シェイク
    const app = document.getElementById('app');
    if (app) {
        app.classList.remove('screen-shake');
        void app.offsetWidth; // リフローを強制して再アニメーション可能にする
        app.classList.add('screen-shake');
        setTimeout(() => app.classList.remove('screen-shake'), 500);
    }

    // 2. 衝撃波エフェクトの生成
    const boardEl = document.getElementById('board');
    if (boardEl) {
        const shock = document.createElement('div');
        shock.className = 'contact-shockwave';
        
        // グリッド座標をピクセルに変換（セルの中心）
        const cells = boardEl.children;
        const targetCell = cells[y * 7 + x];
        if (targetCell) {
            shock.style.left = `${targetCell.offsetLeft + targetCell.offsetWidth / 2}px`;
            shock.style.top = `${targetCell.offsetTop + targetCell.offsetHeight / 2}px`;
            boardEl.appendChild(shock);
            setTimeout(() => shock.remove(), 500);
        }
    }

    // 3. 接触SEの再生（もしあれば。後で追加可能）
    // playSE('se_impact');
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

    // 外科手術的修正：アニメーション開始と同時にステータス（ロックエリア）を再描画する
    // これにより、光る演出と同時にカードがスロットにハマったように見えます
    if (typeof renderStatus === 'function') {
        renderStatus();
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

    // 変数が存在するかチェックし、なければデフォルトの15秒を使う（安全策）
    const maxPhaseTime = (typeof currentPhaseMaxTime !== 'undefined') ? currentPhaseMaxTime : 15;

    if (useGlobalTimer) {
        const p = players[turn];
        if (p) {
            const maxTimeSetting = parseInt(document.getElementById('setting-max-time')?.value || "180");
            p.totalTimeLeft = Math.min(maxTimeSetting, p.totalTimeLeft + seconds);
        }
    } else {
        const current = isNaN(timeLeft) ? 0 : timeLeft;
        timeLeft = Math.min(maxPhaseTime, current + seconds);
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
/**
 * 2026/03/13 修正：BGM音量スライダー（iPhone対応）
 * iOS/Safariでは volume 操作が効きにくい場合があるため、
 * 明示的に属性を更新し、プロパティを再設定します。
 */
function updateBGMVolumeFromSlider(valStr) {
    const vol = parseFloat(valStr) / 100;
    
    // 1. ローカルストレージに保存
    localStorage.setItem('shades_bgm_volume', valStr);
    
    // 2. 音量反映
    if (window.gameBGM) {
        // iPhone対応：mutedがtrueだと音量変更が無視されることがあるため一時的にチェック
        if (window.gameBGM.muted) window.gameBGM.muted = false;

        // 直接 volume を書き換える
        window.gameBGM.volume = vol;
        
        // 【外科手術的補強】一部のブラウザ向けに直接属性をセット
        const bgmEl = document.getElementById('bgm-audio-element'); // もしHTML要素なら
        if (bgmEl) {
            bgmEl.volume = vol;
        }

        console.log(`[iOS Fix] BGM Volume: ${vol}`);
    }
}

// ブラウザの仕様により、関数を確実にHTMLから見つけられるように window オブジェクトに紐付けます
window.updateBGMVolumeFromSlider = updateBGMVolumeFromSlider;

/**
 * 効果音（SE）を再生する共通関数
 */
/* 2026/03/13 修正：再生中のSEを管理する配列 */
let activeSEPool = [];

function playSE(fileName) {
    if (!fileName) return;

    // ブラウザが非表示なら再生しない（スマホのバックグラウンド対策）
    if (document.visibilityState === 'hidden') return;

    const volSlider = document.getElementById('setting-se-volume');
    const vol = volSlider ? (parseInt(volSlider.value) / 100) : 0.5;

    try {
        const audio = new Audio(`audio/${fileName}?v=${Date.now()}`);
        audio.volume = vol;
        audio.preload = "auto";

        const playPromise = audio.play();
        
        // 再生中のリストに追加
        activeSEPool.push(audio);

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn("SE Playback blocked:", fileName, error);
                // 再生できなかった場合はリストから除去
                activeSEPool = activeSEPool.filter(a => a !== audio);
            });
        }
        
        // 終わったらリストから除去して解放
        audio.onended = () => {
            activeSEPool = activeSEPool.filter(a => a !== audio);
            audio.src = "";
            audio.remove();
        };

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

/**
 * デバイスを振動させる（ハプティクスフィードバック）
 * @param {number|number[]} pattern 振動時間(ms)またはパターン [振動, 休止, 振動...]
 */
function triggerHaptic(pattern = 50) {
    if (typeof window.navigator.vibrate === 'function') {
        window.navigator.vibrate(pattern);
    }
}

/**
 * 鼓動のような二段振動（ドックン）
 */
function triggerHeartbeatHaptic() {
    // 60ms振動 - 100ms休止 - 150ms振動
    triggerHaptic([60, 100, 150]);
}

/* 2026/03/13 修正：ブラウザ表示切り替え時にBGMだけでなくSEも一斉停止 */
document.addEventListener('visibilitychange', () => {
    const audio = window.gameBGM; 
    
    if (document.visibilityState === 'hidden') {
        // 1. BGMを一時停止
        if (audio) audio.pause();

        // 2. 再生中のSEをすべて停止・クリア
        activeSEPool.forEach(se => {
            se.pause();
            se.src = "";
            se.remove();
        });
        activeSEPool = []; // リストを空にする
        
    } else if (document.visibilityState === 'visible') {
        // 再表示されたときはBGMのみ再開（SEは突発的な音なので再開不要）
        const isBgmEnabled = localStorage.getItem('shades_bgm_enabled') !== 'false';
        if (audio && isBgmEnabled) {
            audio.play().catch(e => console.log("BGM auto-resume blocked:", e));
        }
    }
});

/** 2026/03/09 修正：カードを捨てる際にログを表示する共通関数を追加 **/
/**
 * カードを捨て札に送り、その内容をログに表示する
 * @param {number} pId - プレイヤーID
 * @param {Object} card - 捨てるカードオブジェクト
 */
function discardCardWithLog(pId, card) {
    if (!card) return;
    
    // 捨て札に追加
    discardPile.push(card);
    
    // ログを表示（カード名を『』で囲むことで、既存の強調ルールを適用）
    const pName = players[pId - 1].name;
    addLog(`[${pName}] が 『${card.name}』 を捨てました。`);
    
    // 手札の再描画（手札から捨てた場合を想定）
    if (typeof renderHand === 'function') renderHand(pId);
}

/**
 * 2026/03/13 追加：異常検知時の緊急停止
 */
/**
 * 2026/03/13 改良：異常検知時の緊急停止 ＋ Discord通知
 */
function emergencyStop(reason) {
    if (winner) return; // 決着後は除外
    
    // 1. タイマーと進行を完全に止める
    if(timerInterval) clearInterval(timerInterval);
    isTimerPaused = true;
    isAutoProcessing = false; // ループ防止

    // 2. ブラウザのタイトルを変えて通知
    let toggle = true;
    const titleInterval = setInterval(() => {
        document.title = toggle ? "⚠️ ERROR! ⚠️" : "● 7 SHADES";
        toggle = !toggle;
    }, 500);

    // 3. ログに赤文字で理由を表示
    addLog(`[ERROR] 緊急停止: ${reason}`);

    // --- 4. 【新規】Discord Webhookへの送信処理 ---
    // --- 4. Discord Webhookへの送信処理（ここをalertより先に、かつ確実に実行させる） ---
    const webhookUrl = "https://discord.com/api/webhooks/1482023390607966279/LQd0_qkEnOnb96d60bwYZ_v1QRCKvy4lAvkigMMjqrBWz8PYeUhESqLr0_c92AgD7ENk";
    
    const p = players[turn] || {name: "Unknown"};
    const content = {
        username: "7 SHADES デバッグ監視",
        embeds: [{
            title: "🚨 異常検知による緊急停止",
            color: 15158332,
            fields: [
                { name: "理由", value: reason },
                { name: "現在の手番", value: p.name, inline: true },
                { name: "フェイズ", value: currentPhase, inline: true },
                { name: "最終ログ", value: lastLogText || "なし" }
            ],
            timestamp: new Date().toISOString()
        }]
    };

    // 通知を送信（alertで止まる前に実行！）
    fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content)
    }).then(() => {
        console.log("Discord通知成功");
    }).catch(err => {
        console.error("Discord通知失敗:", err);
    });

    // 5. 警告音（もしあれば）
    if (typeof playSE === 'function') playSE('se_error.mp3'); 

    // --- 6. 【重要】alertを廃止し、画面上の表示だけにする ---
    // alertはブラウザを完全に止めてしまうので、以下のように書き換えます
    
    addLog(`[System] 緊急停止中。Discordを確認してください。`, true);

    // 代わりに画面中央に大きな警告メッセージを出す（任意）
    const errorBanner = document.createElement('div');
    errorBanner.style = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(255,0,0,0.9); color:white; padding:20px; border-radius:10px; z-index:10000; font-weight:bold; text-align:center; box-shadow:0 0 20px black;";
    errorBanner.innerHTML = `<div>⚠️ ERROR DETECTED ⚠️</div><div style="font-size:10px; margin-top:10px;">${reason}</div><button onclick="this.parentElement.remove()" style="margin-top:10px; background:white; color:red; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">Close</button>`;
    document.body.appendChild(errorBanner);

    // ※ alert("...") は削除、またはコメントアウトしてください
}

/**
 * 2026/03/14 追加：盤面データを送信用の軽量形式に変換
 */
function serializeBoard(boardData) {
    return boardData.map(row => row.map(cell => {
        return {
            x: cell.x,
            y: cell.y,
            // カード本体ではなく ID だけを記録
            cardID: cell.empty ? null : (cell.color.id),
            revealed: cell.revealed,
            empty: cell.empty,
            // スタックも ID の配列にする
            stackIDs: (cell.stack || []).map(c => c.id)
        };
    }));
}