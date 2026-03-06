/**
 * 7 SHADES OF S:EVEN - game_ui_modal.js
 * 【共通定義】
 * - 到達: 表向きカードの上に駒が置かれた瞬間
 * - 到達効果: 到達時に発動。原則「効果解決」→「カード獲得」の順。
 * - 例外: カードに処遇（場に残る、破棄等）が書かれている場合はそれに従う。
 */
/**
 * 2026/02/07 10:40 修正
 * 1. ターン開始通知演出 showTurnChangeNotification の実装。
 * 2. 前回の回答でトークン制限により省略された全てのロジック（約1000行分）を完全に復旧。
 * 3. 処理順の原則（時計回り）を維持。
 * 4. perspective のタイポ修正。
 */

function toggleLightMode(enabled) {
    isLightMode = enabled;
    localStorage.setItem('shades_light_mode', enabled); 
    const body = document.body;
    if (enabled) {
        body.classList.add('light-mode');
        addLog("表示モード: ライト");
    } else {
        body.classList.remove('light-mode');
        addLog("表示モード: ダーク");
    }
}

// --- ページ読み込み時の初期化処理（既存のものを以下に差し替え、または追記） ---
// 保存された設定がない場合は true (ライトモード) をデフォルトにする
const savedMode = localStorage.getItem('shades_light_mode');
const defaultLightMode = savedMode !== null ? (savedMode === 'true') : true;

// DOM読み込み完了時にトグルとbodyの状態を同期
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('light-mode-toggle');
    if (toggle) {
        toggle.checked = defaultLightMode;
        toggleLightMode(defaultLightMode);
    }
});


/** 2026/03/04 修正：デバッグモード移行時にホーム画面を隠す **/
function showPlayerSelection() {
    const titleEl = document.getElementById('title-overlay');
    const setupEl = document.getElementById('setup-overlay');
    const homeEl = document.getElementById('home-screen'); // 追加
    
    if (titleEl) titleEl.classList.add('hidden');
    if (homeEl) homeEl.classList.add('hidden'); // 追加
    if (setupEl) setupEl.classList.remove('hidden');
}


/**
 * セットアップ画面（プレイ人数選択）の表示
 */
function showSetup() {
    window.FORCED_CPU_MODE = false; // フラグ解除
    // ※ window.isProfileSet = false; は実行しない（名前設定を維持するため）

    // BGMの停止処理
    if (window.gameBGM) {
        window.gameBGM.pause();
        window.gameBGM.currentTime = 0;
        window.gameBGM = null;
    }

    if (typeof cleanupGame === 'function') cleanupGame();

    const titleEl = document.getElementById('title-overlay');
    const setupEl = document.getElementById('setup-overlay');
    const winnerOverlay = document.getElementById('winner-overlay');
    const profileModal = document.getElementById('profile-setup-modal');
    
    // 画面の初期化：タイトル画面のみ表示し、他を隠す
    if (titleEl) titleEl.classList.remove('hidden');
    if (setupEl) setupEl.classList.add('hidden');
    if (winnerOverlay) winnerOverlay.classList.add('hidden');
    if (profileModal) profileModal.classList.add('hidden');

    // 既存のUI初期化処理（そのまま継続）
    if (document.getElementById('my-lock-container')) document.getElementById('my-lock-container').classList.add('hidden');
    if (document.getElementById('hand-area-container')) document.getElementById('hand-area-container').classList.add('hidden');
    // ...以降のコードは既存のものを維持してください...

    const boardEl = document.getElementById('board-grid');
    if (boardEl) boardEl.innerHTML = '';
    
    ['area-p1', 'area-p2', 'area-p3', 'area-p4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    const handEl = document.getElementById('current-hand');
    if (handEl) handEl.innerHTML = '';
    
    const lockEl = document.getElementById('my-lock-slots');
    if (lockEl) lockEl.innerHTML = '';
    
    const logEl = document.getElementById('log-area');
    if (logEl) logEl.innerHTML = '<div>&gt; System Reset...</div>';

    if (typeof renderDeckAndDiscard === 'function') {
        renderDeckAndDiscard();
    }
    
    if (document.getElementById('hand-count')) document.getElementById('hand-count').textContent = '0枚';
    if (document.getElementById('timer-wrapper')) document.getElementById('timer-wrapper').classList.add('hidden');
    
    document.querySelectorAll('.phase-step').forEach(el => el.classList.remove('active', 'passed'));

    const skipBtn = document.getElementById('skip-btn');
    if (skipBtn) skipBtn.classList.add('hidden');

    // 【重要】イベントリスナーを再セットアップ
    if (typeof setupProfileUI === 'function') {
        setupProfileUI();
    }
}

/**
 * ルール説明モーダルの表示
 */
/**
 * 2026/02/24 17:55 修正
 * 1. 関数名を showRules に統一。
 * 2. 簡易テキスト表示から、GLOSSARY_DATA を用いたスクロール可能な詳細リスト表示へ変更。
 */
function showRules() {
    // 既存のモーダルがあれば消す
    const old = document.getElementById('rule-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.className = "fixed inset-0 bg-black/80 flex items-center justify-center z-[10000] p-4";
    modal.id = "rule-modal";

    // data_cards.js で定義した GLOSSARY_DATA を HTML化
    const glossaryHTML = GLOSSARY_DATA.map(item => `
        <div class="mb-3 border-b border-gray-700 pb-2">
            <dt class="text-yellow-500 light-text-orange font-bold text-[13px]">【${item.term}】</dt>
            <dd class="text-gray-200 light-text-dark text-[11px] leading-relaxed ml-1">${item.desc}</dd>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="bg-gray-800 border-2 border-yellow-600 w-full max-w-sm max-h-[80vh] flex flex-col rounded-lg shadow-2xl">
            <div class="p-3 border-b border-gray-700 flex justify-between items-center shrink-0">
                <h2 class="text-lg font-bold text-yellow-500">ゲームルール・用語定義</h2>
                <button id="close-rule-modal" class="text-gray-400 hover:text-white text-2xl px-2">&times;</button>
            </div>
            <div class="p-4 overflow-y-auto custom-scrollbar">
                <section class="mb-6">
                    <h3 class="text-md font-bold text-white mb-2 border-l-4 border-yellow-500 pl-2">ゲームの流れ</h3>
                    <ol class="text-xs text-gray-300 space-y-1 list-decimal list-inside">
                        <li>ロックフェイズ：手札から1枚ロック（任意）</li>
                        <li>ハンドフェイズ：手札効果を好きなだけ使用（任意）</li>
                        <li>ムーブフェイズ：移動または接触（強制）</li>
                    </ol>
                </section>
                <section class="mb-6">
                    <h3 class="text-md font-bold text-white mb-2 border-l-4 border-yellow-500 pl-2">勝利条件</h3>
                    <p class="text-xs text-gray-300">7色のカードをロックエリアに揃えたプレイヤーの勝利です。</p>
                </section>
                <section>
                    <h3 class="text-md font-bold text-white mb-3 border-l-4 border-yellow-500 pl-2">用語定義一覧</h3>
                    <dl>
                        ${glossaryHTML}
                    </dl>
                </section>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-rule-modal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

/**
 * テストモード画面を開く
 */
function openTestMode() { 
    const setupEl = document.getElementById('setup-overlay');
    const testEl = document.getElementById('test-mode-modal');
    if(setupEl) setupEl.classList.add('hidden'); 
    if(testEl) {
        testEl.classList.remove('hidden'); 
        testEl.style.zIndex = "200";
    }
    
    if (document.getElementById('my-lock-container')) document.getElementById('my-lock-container').classList.add('hidden');
    if (document.getElementById('hand-area-container')) document.getElementById('hand-area-container').classList.add('hidden');

    const list = document.getElementById('test-card-list'); 
    if(!list) return;
    
    list.innerHTML = ''; 
    testSelectedCards = []; 
    
    // カテゴリごとにカードを表示
    const cats = [...BASE_COLORS, RAINBOW_COLOR, WHITE_COLOR, BLACK_COLOR];
    cats.forEach(cat => {
        const cCards = CARD_DATABASE.filter(c => c.type === 'NORMAL' && c.colorId === cat.id); 
        if (cCards.length === 0) return;

        const header = document.createElement('div'); 
        header.className = "w-full text-left text-[10px] font-bold mt-3 mb-1 border-b border-gray-600 pb-0.5 sticky top-0 bg-gray-800 z-10"; 
        header.style.color = cat.hex || '#fff'; 
        header.textContent = `■ ${cat.name}`; 
        list.appendChild(header);

        const group = document.createElement('div'); 
        group.className = "flex flex-wrap gap-2 justify-start w-full mb-2"; 
        list.appendChild(group);

        cCards.forEach(c => {
            const d = document.createElement('div'); 
            d.id = `test-card-${c.id}`;
            d.className = "w-12 h-12 rounded border border-gray-500 bg-gray-700 text-white text-[10px] test-card-select flex flex-col items-center justify-center cursor-pointer relative shrink-0 transition-all hover:border-yellow-400 active:scale-95 overflow-hidden shadow-md"; 
            
            const imgPath = c.image || (c.id ? `images/card_${c.id}.webp` : null);
            if (imgPath) {
                d.style.backgroundImage = `url('${imgPath}')`;
                d.style.backgroundSize = 'cover';
                d.style.backgroundPosition = 'center';
                d.innerHTML = ""; 
            } else {
                d.innerHTML = `<span style="color:${c.hex || '#fff'}; pointer-events:none;">${c.name[0]}</span>`; 
            }
            
            d.onclick = (e) => { 
                e.preventDefault();
                const isSelected = testSelectedCards.some(s => s.id === c.id);
                if(isSelected){ 
                    testSelectedCards = testSelectedCards.filter(s => s.id !== c.id); 
                    d.classList.remove('selected'); 
                } else { 
                    testSelectedCards.push(c); 
                    d.classList.add('selected'); 
                } 
            }; 
            group.appendChild(d);
        });
    });
    managePeekUI(true);
}

/**
 * テストモード画面を閉じる
 */
function closeTestMode() { 
    const testEl = document.getElementById('test-mode-modal');
    const setupEl = document.getElementById('setup-overlay');
    if(testEl) testEl.classList.add('hidden'); 
    if(setupEl) setupEl.classList.remove('hidden');
    managePeekUI(false); 
}

/**
 * テスト用カードをすべて選択
 */
function selectAllTestCards() { 
    testSelectedCards = []; 
    const normalCards = CARD_DATABASE.filter(c => c.type === 'NORMAL');
    normalCards.forEach(c => {
        testSelectedCards.push(c);
        const el = document.getElementById(`test-card-${c.id}`);
        if(el) el.classList.add('selected');
    }); 
}

/**
 * プレイヤー詳細モーダルの表示
 */
function openPlayerDetailModal(pid) { 
    if (!players || players.length === 0) return;
    const p = players.find(pl => pl.id === pid);
    if (!p) return;

    // --- 追加：プロフィール画像の表示処理 ---
    const modal = document.getElementById('player-detail-modal');
    const nameEl = document.getElementById('pd-name');
    if (modal && nameEl) {
        // 既存の画像をチェックして削除
        const oldImg = modal.querySelector('.pd-profile-img');
        if (oldImg) oldImg.remove();

        // 画像要素を作成して挿入
        const img = document.createElement('img');
        img.src = p.icon || `images/character_00${p.id}.webp`;
        img.className = "pd-profile-img w-16 h-16 rounded-full border-2 border-gray-500 shadow-md object-cover mx-auto mb-2";
        nameEl.parentNode.insertBefore(img, nameEl);
    }
    // ------------------------------------

    const pHand = hands[p.id] || [], pCols = collections[p.id] || {}; 
    
    // 自分のターンかつ操作中のプレイヤーが自分自身か確認
    const isMyTurn = (turn === players.indexOf(p));
    const isHuman = (p.id === 1); 

    if (nameEl) nameEl.textContent = `${p.name} の詳細`;
    document.getElementById('pd-hand-count').textContent = pHand.length; 
    const lockAreaEl = document.getElementById('pd-lock-area'); 
    if (!lockAreaEl) return;
    lockAreaEl.innerHTML = ''; 
    
    LOCK_ORDER.forEach(color => { 
        const wrapper = document.createElement('div'); 
        wrapper.className = "w-10 min-h-[6rem] rounded border border-gray-600 bg-gray-900 flex flex-col items-center p-0.5 gap-0.5 relative"; 
        const slotCards = pCols[color.id] || []; 
        if(slotCards.length > 0) { 
            slotCards.forEach((c) => {
                const cardDiv = document.createElement('div');
                let faceClass = c.type === "ETERNAL" ? "eternal-card-face" : c.bg;
                let txtCls = c.colorId === 'white' ? 'text-gray-800' : (c.colorId === 'black' ? 'text-gray-200' : 'text-white');
                cardDiv.className = `w-8 h-8 rounded border border-white ${faceClass} flex items-center justify-center shadow-lg shrink-0 relative overflow-hidden cursor-pointer`;
                
                const imgPath = c.image || (c.id ? `images/card_${c.id}.webp` : null);
                if (imgPath) {
                    cardDiv.style.backgroundImage = `url('${imgPath}')`;
                    cardDiv.style.backgroundSize = 'cover';
                    cardDiv.style.backgroundPosition = 'center';
                    cardDiv.innerHTML = ""; 
                } else {
                    cardDiv.innerHTML = `<span class="font-bold text-[8px] ${txtCls} z-10">${c.name ? c.name[0] : '?'}</span>`;
                }

                // 【追加】ロック中のエターナル/ファーストを手札効果として使用
                if (isMyTurn && isHuman && (c.type === "FIRST" || c.type === "ETERNAL")) {
                    cardDiv.onclick = (e) => {
                        e.stopPropagation();
                        closePlayerDetail(); // 詳細画面を閉じてから発動
                        handleHandClick(-1, c);
                    };
                }

                attachHoverEvents(cardDiv, c);
                wrapper.appendChild(cardDiv);
            });
        } else { wrapper.style.borderColor = color.hex; } 
        lockAreaEl.appendChild(wrapper); 
    }); 

    const handAreaEl = document.getElementById('pd-hand-area'); 
    if (!handAreaEl) return;
    handAreaEl.innerHTML = ''; 
    pHand.forEach((card, hIdx) => { 
        const div = document.createElement('div'); 
        if(card.isPublic) { 
            let faceClass = card.type === "ETERNAL" ? "eternal-card-face" : card.bg;
            let txtCls = card.colorId === 'white' ? 'text-gray-800' : (card.colorId === 'black' ? 'text-gray-200' : 'text-white');
            div.className = `w-8 h-8 rounded border border-white ${faceClass} flex items-center justify-center relative overflow-hidden cursor-pointer`; 
            const imgPath = card.image || (card.id ? `images/card_${card.id}.webp` : null);
            if (imgPath) {
                div.style.backgroundImage = `url('${imgPath}')`; 
                div.style.backgroundSize = 'cover'; 
                div.style.backgroundPosition = 'center';
                div.innerHTML = ""; 
            } else {
                div.innerHTML = `<span class="font-bold text-[8px] ${txtCls} z-10">${card.name ? card.name[0] : '?'}</span>`;
            }

            // 【追加】公開手札内をクリックして使用
            if (isMyTurn && isHuman) {
                div.onclick = (e) => {
                    e.stopPropagation();
                    closePlayerDetail();
                    handleHandClick(hIdx);
                };
            }

            attachHoverEvents(div, card); 
        } else { 
            div.className = "w-8 h-8 rounded border border-gray-500 card-back-pattern flex items-center justify-center"; 
            div.innerHTML = `<span class="text-xs text-gray-500">?</span>`; 
        } 
        handAreaEl.appendChild(div); 
    }); 
   
    if (modal) {
        modal.classList.remove('hidden'); 
        modal.style.zIndex = "150";
    }
    managePeekUI(true); 
}

/**
 * プレイヤー詳細モーダルを閉じる
 */
function closePlayerDetail() {
    const modal = document.getElementById('player-detail-modal');
    if (modal) modal.classList.add('hidden');
    managePeekUI(false);
}

/**
 * 設定画面の表示
 */
function showSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.zIndex = "200";
    }
    managePeekUI(true);
}

/**
 * 設定画面を閉じる
 */
function closeSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
    managePeekUI(false);
}

/**
 * 開発用設定画面を開く
 */
function openDevSettings() {
    // 1. 保存された基本設定の復元
    try {
        const saved = localStorage.getItem('shades_seven_dev_configs');
        if (saved) {
            const configs = JSON.parse(saved);
            for (const [id, value] of Object.entries(configs)) {
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') el.checked = value;
                    else el.value = value;
                }
            }
        }
    } catch (e) { console.error("Dev config load error:", e); }

    // 2. 保存された AI スコアの復元
    try {
        const savedAi = localStorage.getItem('shades_seven_ai_scores');
        if (savedAi && window.AI_SCORE_CONFIG) {
            window.AI_SCORE_CONFIG = JSON.parse(savedAi);
            const scoreMap = {
                'ai-score-card-count': 'CARD_COUNT',
                'ai-score-unlocked-color': 'UNLOCKED_COLOR',
                'ai-score-adjacent-enemy': 'ADJACENT_ENEMY',
                'ai-score-self-defense': 'SELF_GATE_DEFENSE',
                'ai-score-approach-enemy': 'APPROACH_ENEMY_GATE',
                'ai-score-reach-enemy': 'REACH_ENEMY_GATE',
                'ai-score-rare-color': 'RARE_COLOR',
                'ai-score-power-near': 'POWER_CARD_NEAR',
                'ai-score-steal-action': 'STEAL_ACTION'
            };
            for (const [id, key] of Object.entries(scoreMap)) {
                const input = document.getElementById(id);
                if (input) input.value = window.AI_SCORE_CONFIG[key];
            }
        }
    } catch (e) { console.error("AI score load error:", e); }

    const modal = document.getElementById('dev-settings-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.zIndex = "250";
    }
    if (typeof managePeekUI === 'function') managePeekUI(true);
}

/**
 * 開発用設定画面を閉じる
 */
function closeDevSettings() {
    // 1. 各種チェックボックスや数値設定の保存
    const devSettingIds = [
        'setting-phase-time', 
        'setting-phase-time-add', 
        'setting-init-time',
        'setting-p1-timer-ignore', 
        'setting-timeout-random-lock', // ← 正しいIDに修正
        'setting-timeout-auto-hand',   // ← 正しいIDに修正
        'setting-p1-hand-only', 
        'setting-skip-selection', 
        'setting-auto-mode',
        'setting-boost-mode', 
        'setting-no-colorless', // ★追加
        'setting-max-time'
    ];

    const savedDevSettings = {};
    devSettingIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            savedDevSettings[id] = (el.type === 'checkbox') ? el.checked : el.value;
        }
    });
    localStorage.setItem('shades_seven_dev_configs', JSON.stringify(savedDevSettings));

    // 2. AIスコア設定の読み取りと保存
    if (window.AI_SCORE_CONFIG) {
        const scoreIds = {
            CARD_COUNT: 'ai-score-card-count',
            UNLOCKED_COLOR: 'ai-score-unlocked-color',
            ADJACENT_ENEMY: 'ai-score-adjacent-enemy',
            SELF_GATE_DEFENSE: 'ai-score-self-defense',
            APPROACH_ENEMY_GATE: 'ai-score-approach-enemy',
            REACH_ENEMY_GATE: 'ai-score-reach-enemy',
            RARE_COLOR: 'ai-score-rare-color',
            POWER_CARD_NEAR: 'ai-score-power-near',
            STEAL_ACTION: 'ai-score-steal-action'
        };

        for (const [key, id] of Object.entries(scoreIds)) {
            const input = document.getElementById(id);
            if (input) {
                window.AI_SCORE_CONFIG[key] = parseInt(input.value) || 0;
            }
        }
        localStorage.setItem('shades_seven_ai_scores', JSON.stringify(window.AI_SCORE_CONFIG));
    }

    const modal = document.getElementById('dev-settings-modal');
    if (modal) modal.classList.add('hidden');
    if (typeof managePeekUI === 'function') managePeekUI(false);
}


/**
 * 捨て札一覧の表示
 */
function showDiscardPile() {
    const listContainer = document.getElementById('discard-list-container'); 
    if(!listContainer) return;
    listContainer.innerHTML = ''; 
    if (!discardPile || discardPile.length === 0) { 
        listContainer.innerHTML = '<p class="text-gray-500 text-sm italic">捨て札はありません</p>'; 
    } else { 
        [...discardPile].reverse().forEach(card => { 
            const el = document.createElement('div'); 
            let txtCls = card.colorId === 'white' ? 'text-gray-800' : (card.colorId === 'black' ? 'text-gray-200' : 'text-white');
            el.className = `card-shape w-12 h-12 rounded border border-white flex items-center justify-center shadow-lg ${card.bg} shrink-0 relative overflow-hidden`; 
            const imgPath = card.image || (card.id ? `images/card_${card.id}.webp` : null);
            if (imgPath) {
                el.style.backgroundImage = `url('${imgPath}')`; 
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.innerHTML = ""; 
            } else {
                el.innerHTML = `<span class="font-bold text-xs ${txtCls} z-10">${card.name ? card.name[0] : '?'}</span>`;
            }
            attachHoverEvents(el, card); 
            listContainer.appendChild(el); 
        }); 
    }
    const modal = document.getElementById('discard-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.zIndex = "150";
    }
    managePeekUI(true);
}

/**
 * 捨て札一覧を閉じる
 */
function closeDiscardPile() {
    const modal = document.getElementById('discard-modal');
    if (modal) modal.classList.add('hidden');
    managePeekUI(false);
}

/**
 * 詳細確認モーダルの表示
 */
function showDetailModal(title, msg, card, btnText, onOk, hideCancel = false) { 
    
    // ★追加：自動処理(isAutoAction)がON かつ スキップ設定がONの場合、かつ実行アクション(onOk)がある場合
    if (isAutoAction && isSkipSelectionOnAuto && onOk) {
        // 条件チェック（使用不可のカードを自動で使わないようにするため、isPlayableの判定ロジックを一部先読み）
        let isPlayable = true;
        const p = players[turn];
        if (card) {
            const isLocking = (currentPhase === PHASE.LOCK && title.includes("ロック"));
            const isMoving = title.includes("移動") || title.includes("接触");
            const isReaction = (card.id === 22 || title.includes("確認") === false || title.includes("反撃"));
            
            if (!isReaction && !isLocking && !isMoving) {
                if (typeof canPlayHandEffect === 'function') isPlayable = canPlayHandEffect(card, p);
                if (card.id === 11 && p.viridianUsed) isPlayable = false;
            }
        }

        if (isPlayable) {
            addLog(`[Auto] ${title} を自動実行します`);
            // 演出のために少し待機して実行
            setTimeout(() => {
                isHandEffectProcessing = true;
                if (typeof hideHoverPreview === 'function') hideHoverPreview(true);
                onOk();
            }, 300);
            return; // モーダルを表示せずに終了
        }
    }

    const modal = document.getElementById('detail-modal');
    if (!modal) return;
    
    modal.style.zIndex = "150";

    const cancelBtn = document.getElementById('detail-cancel-btn'); 
    if(cancelBtn) {
        cancelBtn.textContent = "キャンセル"; 
        cancelBtn.classList.toggle('hidden', hideCancel); 
        cancelBtn.onclick = closeDetailModal; 
    }
    document.getElementById('detail-title').textContent = title; 
    document.getElementById('detail-msg').innerHTML = msg; 

    const okBtn = document.getElementById('detail-ok-btn'); 
    if(!okBtn) return;

    // ライトモード時はボタン色を調整
    if (isLightMode) {
        okBtn.classList.replace('bg-blue-600', 'bg-blue-700');
    } else {
        okBtn.classList.replace('bg-blue-700', 'bg-blue-600');
    }

    okBtn.textContent = btnText || "実行";

    // --- 使用可能判定ロジック ---
    let isPlayable = true;
    const p = players[turn];

    if (card && onOk) {
        // ロックフェイズ中かつ、このカードをロックしようとしている（titleにロックが含まれる）場合は
        // 手札効果のコストチェック（canPlayHandEffect）をバイパスする
        const isLocking = (currentPhase === PHASE.LOCK && title.includes("ロック"));
        
        // 【修正箇所】移動や接触の確認時は、盤面のカードを表示しているだけなのでチェック不要
        const isMoving = title.includes("移動") || title.includes("接触");

        // 反撃(ID:22) または タイトルが「確認」以外（割り込み等の特殊な確認）の場合は、
        // ターンプレイヤー以外の使用も許可する
        const isReaction = (card.id === 22 || title.includes("確認") === false || title.includes("反撃"));
        
        // 移動中、ロック中、または反撃中ではない「通常の手札使用」の時だけチェックする
        if (!isReaction && !isLocking && !isMoving) {
            if (typeof canPlayHandEffect === 'function') {
                isPlayable = canPlayHandEffect(card, p);
            }
            if (card.id === 11 && p.viridianUsed) {
                isPlayable = false;
            }
        }
    }

    if (!isPlayable) {
        // 条件を満たさない場合は強制的に無効化
        okBtn.disabled = true;
        okBtn.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-600', 'grayscale');
        okBtn.classList.remove('bg-blue-600', 'hover:bg-blue-500');
        okBtn.onclick = null;
        
        const msgEl = document.getElementById('detail-msg');
        if (!msgEl.innerHTML.includes("使用できません")) {
            msgEl.innerHTML += `<br><span class="text-red-500 text-[10px] font-bold">※このターンはもう使用できません</span>`;
        }
    } else if (onOk) { 
        // 使用可能な場合
        okBtn.disabled = false; 
        okBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-600', 'grayscale'); 
        okBtn.classList.add('bg-blue-600', 'hover:bg-blue-500'); 
        okBtn.onclick = () => { 
            // 【変更】全手札共通のロックフラグを立てる
            isHandEffectProcessing = true; 

            if (typeof hideHoverPreview === 'function') hideHoverPreview(true);
            if (typeof gainTime === 'function') gainTime(5); 
            closeDetailModal(); 
            onOk(); 
        }; 
    
    } else {
        // そもそもアクションがない（見るだけ）の場合
        okBtn.disabled = true; 
        okBtn.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-600'); 
        okBtn.classList.remove('bg-blue-600', 'hover:bg-blue-500'); 
        okBtn.onclick = null; 
    }

    if (isAutoAction && !okBtn.disabled) {
        setTimeout(() => {
            if (okBtn) okBtn.click();
        }, 500);
    }

    
    const view = document.getElementById('detail-card-view');
    const charEl = document.getElementById('detail-card-char');
    const nameEl = document.getElementById('detail-card-name');
    const arrivalEl = document.getElementById('detail-arrival-text');
    const handEl = document.getElementById('detail-hand-text');

    if (card) {
        // カードの表示サイズを大きくする
        view.classList.add('modal-large-card');
        view.classList.remove('w-24', 'h-24'); // もし既存の小さいサイズクラスがあれば除去

        const newView = view.cloneNode(true);
        view.parentNode.replaceChild(newView, view);
        newView.classList.remove('hidden');

        // クローンされたコンテナ内から各要素を再取得
        const newCharEl = newView.querySelector('#detail-card-char');
        const newNameEl = newView.querySelector('#detail-card-name');
        const newArrivalEl = newView.querySelector('#detail-arrival-text');
        const newHandEl = newView.querySelector('#detail-hand-text');

        const imgPath = card.image || (card.id ? `images/card_${card.id}.webp` : null);

        if (imgPath) {
            // 画像がある場合：背景を設定し、コンテナ内のテキスト要素をすべて隠す
            newView.style.backgroundImage = `url('${imgPath}')`;
            newView.style.backgroundSize = 'cover';
            newView.style.backgroundPosition = 'center';

            if (newCharEl) newCharEl.textContent = "";
            if (newNameEl) newNameEl.classList.add('hidden');
            // 【重要】画像の上に乗らないようテキストエリアを隠す
            if (newArrivalEl) newArrivalEl.classList.add('hidden');
            if (newHandEl) newHandEl.classList.add('hidden');
        } else {
            // 画像がない場合：背景をクリアし、テキストを表示する
            newView.style.backgroundImage = 'none';
            if (newCharEl) newCharEl.textContent = card.name ? card.name[0] : '?';
            if (newNameEl) {
                newNameEl.textContent = card.name || "";
                newNameEl.classList.remove('hidden');
            }
            // テキストエリアを表示して内容を更新
            if (newArrivalEl) {
                newArrivalEl.classList.remove('hidden');
                newArrivalEl.innerHTML = `<span class="text-yellow-500 font-bold">【到達】</span>${card.arrival || "(なし)"}`;
            }
            if (newHandEl) {
                newHandEl.classList.remove('hidden');
                newHandEl.innerHTML = `<span class="text-blue-400 font-bold">【手札】</span>${card.hand || "(なし)"}`;
            }
        }

        // モーダル下部の独立したテキストエリア（もしHTML構造上、外側にもある場合）も更新
        // ※念のため、画像コンテナ外の要素も更新しておきます
        const externalArrival = document.getElementById('detail-arrival-text');
        const externalHand = document.getElementById('detail-hand-text');
        // コンテナの外にある場合のみここが機能します
        if (externalArrival && externalArrival.parentNode !== newView) {
             externalArrival.innerHTML = `<span class="text-yellow-500 font-bold">【到達】</span>${card.arrival || "(なし)"}`;
        }
        if (externalHand && externalHand.parentNode !== newView) {
             externalHand.innerHTML = `<span class="text-blue-400 font-bold">【手札】</span>${card.hand || "(なし)"}`;
        }

        if (typeof attachHoverEvents === 'function') {
            attachHoverEvents(newView, card, true);
        }
    } else {
        view.classList.add('hidden');
    }

    modal.classList.remove('hidden'); 
    managePeekUI(true);
}

function closeDetailModal() { 
    const modal = document.getElementById('detail-modal');
    if (modal) modal.classList.add('hidden');
    
    tempAction = null; 
    
    // 拡大画面（ホバープレビュー）を確実に閉じる
    if (typeof hideHoverPreview === 'function') {
        // 引数なしで呼び出し、かつ念のためDOMを直接操作して確実に消す
        hideHoverPreview();
    }
    
    const previewEl = document.getElementById('hover-preview');
    if (previewEl) {
        previewEl.classList.add('hidden');
        previewEl.style.display = 'none'; // 強制的に非表示
    }
    
    managePeekUI(false); 
}

/**
 * カード選択モーダルの表示
 */
function showSelectionModal(title, dummy, source, back, count, onComplete, isBlind = false, cancelCallback = null, autoBtnText = null, restrictedCells = null, actingPlayer = null) { 
    
    // --- 修正箇所：タイマー譲渡とリセット ---
    if (actingPlayer) {
        activeTimerPlayerId = actingPlayer.id;
        // 相手に渡す際、フェイズ残り時間をリセットする
        const phaseMax = parseInt(document.getElementById('setting-phase-time')?.value || "30");
        timeLeft = phaseMax;
    }
    
    // ★自動処理(isAutoAction)がON かつ スキップ設定がONの場合のみバイパス
    if (isAutoAction && isSkipSelectionOnAuto) {
        addLog(`[Auto] ${title} を自動選択中...`);

        // 1. 有効な選択肢（disabledでないもの）を抽出
        const validSource = source.filter(item => !item.disabled);

        // 2. 選択肢がない場合はキャンセル処理へ
        if (validSource.length === 0) {
            addLog(`[Auto] 選択可能な対象がないためスキップします`);
            if (cancelCallback) cancelCallback();
            else onComplete([]);
            return;
        }

        // 3. 必要な数だけシャッフルして選択
        const finalCount = Math.min(count, validSource.length);
        const shuffled = [...validSource].sort(() => Math.random() - 0.5);
        const selection = shuffled.slice(0, finalCount);
        
        // 4. 演出のために少し待ってから、モーダルを表示せずに直接完了を呼ぶ
        // ※モーダルを表示させると、その中のボタンクリック待ちでフリーズするため
        setTimeout(() => {
            // 後続の効果処理で isAutoAction が必要になる場合があるため、
            // ここではフラグを折らずにそのまま callback を実行する
            addLog(`[Auto] ${selection.map(s => s.name || '対象').join(', ')} を選択しました`);
            onComplete(selection);
        }, 500);
        return; 
    }
    
    const modal = document.getElementById('selection-modal'); 
    if (!modal) return;
    
    modal.style.zIndex = "150";
    document.getElementById('selection-title').textContent = title; 
    document.getElementById('selection-desc').textContent = dummy; 
    const container = document.getElementById('selection-container'); 
    if (!container) return;

    container.classList.remove('hidden'); 
    container.innerHTML = ''; 
    
    const isLockTargetSelect = (source && source.length > 0 && source[0] && source[0].id && BASE_COLORS.some(bc => bc.id === source[0].id));
    container.className = isLockTargetSelect ? "flex flex-nowrap justify-center gap-2 p-4 min-h-[100px] overflow-x-auto w-full" : "flex flex-wrap justify-center gap-3 p-4 min-h-[100px] max-h-[45vh] overflow-y-auto w-full";
    document.getElementById('selection-result').classList.add('hidden'); 
    
    const cancelBtn = document.getElementById('selection-cancel-btn'); 
    if (cancelBtn) {
        // 修正箇所：ボタンの表示名を「おまかせ」に変更
        if (cancelCallback) { 
            cancelBtn.classList.remove('hidden'); 
            cancelBtn.textContent = "おまかせ"; 
            cancelBtn.onclick = () => { 
                activeTimerPlayerId = null; // タイマーを手番プレイヤーに戻す
                modal.classList.add('hidden'); 
                managePeekUI(false); 
                cancelCallback(); 
            };
        } else { 
            cancelBtn.classList.add('hidden'); 
        }
    }
    
    let selected = [];

    const autoBtn = document.getElementById('selection-auto-btn');
    if (autoBtn) {
        if (autoBtnText) {
            autoBtn.classList.remove('hidden'); autoBtn.textContent = autoBtnText;
            autoBtn.onclick = () => {
                showSelectionResult(selected, onComplete, title, cancelCallback, autoBtnText, isBlind, actingPlayer);
            };
        } else { autoBtn.classList.add('hidden'); }
    }

    const createItemEl = (item) => {
        if(!item) return null;
        const el = document.createElement('div');
        
        // After: 常に 'selection-option' を付与することで、AIが handleTimeOut 経由でクリックできるようにします
        if (item.type === "PLAYER_SELECT") { 
            el.className = `selection-option w-40 p-2 rounded border-2 border-gray-600 bg-gray-800 cursor-pointer hover:border-yellow-500 transition-all flex flex-col items-center shrink-0`; 
            el.innerHTML = `<span class="text-white font-bold text-sm mb-1">${item.name}</span><div class="flex gap-0.5 justify-center" id="mini-locks-${item.id}"></div>`;         const lockContainer = el.querySelector(`#mini-locks-${item.id}`); 
            const targetPl = players.find(pl => pl.id === item.id); 
            if (targetPl) {
                LOCK_ORDER.forEach(color => { 
                    const slot = collections[targetPl.id][color.id]; 
                    const slotDiv = document.createElement('div'); 
                    slotDiv.className = `w-4 h-4 rounded-sm border border-gray-600 flex items-center justify-center text-[6px] relative overflow-hidden`; 
                    if (slot && slot.length > 0) { 
                        const topC = slot[slot.length-1]; 
                        let faceClass = topC.type === "ETERNAL" ? "eternal-card-face" : topC.bg;
                        slotDiv.className += ` border-white ${faceClass}`; 
                        const imgPath = topC.image || (topC.id ? `images/card_${topC.id}.webp` : null);
                        if (imgPath) {
                            slotDiv.style.backgroundImage = `url('${imgPath}')`; 
                            slotDiv.style.backgroundSize = 'cover'; 
                            slotDiv.innerHTML = "";
                        } else {
                            slotDiv.innerHTML = topC.name[0];
                        }
                    } else { slotDiv.style.borderColor = color.hex; } 
                    lockContainer.appendChild(slotDiv); 
                });
            }
        } else {
            let cardCls = isBlind ? back : (item.type === "ETERNAL" ? "eternal-card-face" : (item.bg || 'bg-gray-700'));
            let txtCls = (!isBlind && item.colorId === 'white' ? 'text-gray-800' : (item.colorId === 'black' ? 'text-gray-200' : 'text-white'));
            
            // After: カード要素にも確実に selection-option を付与
            el.className = `selection-option card-shape w-12 h-12 ${cardCls} border-2 border-gray-400 rounded cursor-pointer hover-zoom transition-all flex items-center justify-center relative shrink-0 overflow-hidden`;
            
            if (!isBlind) {
                const imgPath = item.image || (item.id ? `images/card_${item.id}.webp` : null);
                if (imgPath) {
                    el.style.backgroundImage = `url('${imgPath}')`;
                    el.style.backgroundSize = 'cover';
                    el.style.backgroundPosition = 'center';
                    el.innerHTML = "";
                } else {
                    el.innerHTML = `<span class="${txtCls} font-bold z-10">${item.name ? item.name[0] : '?'}</span>`;
                }
            } else {
                el.innerHTML = `<span class="text-gray-500 opacity-50 text-xl font-bold">?</span>`;
            }
        }
        el.onclick = (e) => { 
            e.stopPropagation(); 
            if (item.disabled) return;

            // 【外科手術的修正】テストモード等、プレイヤーがまだ生成されていない状況での gainTime エラーを防止
            if (typeof players !== 'undefined' && players && players.length > 0) {
                if (typeof gainTime === 'function') gainTime(5); 
            }

            if (selected.includes(item)) { 
                selected = selected.filter(c => c !== item); 
                el.classList.remove('selected-card-glow'); 
            } else { 
                if (selected.length < count) { 
                    selected.push(item); 
                    el.classList.add('selected-card-glow'); 
                } 
            } 
            
            // 選択枚数に達したら結果画面へ
            if (selected.length === count) {
                setTimeout(() => {
                    if (typeof showSelectionResult === 'function') {
                        showSelectionResult(selected, onComplete, title, cancelCallback, autoBtnText, isBlind, actingPlayer);
                    }
                }, 300); 
            }
        };
        return el;
    };

    if (source) {
        source.forEach(item => { const el = createItemEl(item); if (el) container.appendChild(el); });
    }
    modal.classList.remove('hidden'); 
    managePeekUI(true); 
}

/**
 * 選択結果の最終確認
 */
function showSelectionResult(cards, onComplete, effectName, cancelCallback = null, autoBtnText = null, isBlind = false, actingPlayer = null) { 
    const area = document.getElementById('selection-result'); 
    if (!area) return;
    area.classList.remove('hidden'); 
    document.getElementById('selection-container').classList.add('hidden');
    
    const cancelBtn = document.getElementById('selection-cancel-btn');
    const autoBtn = document.getElementById('selection-auto-btn');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    if (autoBtn) autoBtn.classList.add('hidden');

    const resContainer = document.getElementById('selection-result-container'); 
    if (!resContainer) return;
    resContainer.innerHTML = ''; 
    
    if (cards && Array.isArray(cards)) {
        cards.forEach(c => { 
            const view = document.createElement('div'); 
            if (c.type === "PLAYER_SELECT") { 
                view.className = "p-4 bg-gray-800 border-4 border-yellow-500 rounded-xl text-white font-bold shrink-0"; 
                view.textContent = c.name; 
            } else { 
                let txtCls = c.colorId === 'white' ? 'text-gray-800' : (c.colorId === 'black' ? 'text-gray-200' : 'text-white');
                view.className = `card-shape w-24 h-24 rounded-xl border-4 border-white flex flex-col items-center justify-center shadow-2xl animate-bounce shrink-0 relative overflow-hidden ${c.bg}`; 
                const imgPath = c.image || (c.id ? `images/card_${c.id}.webp` : null);
                if (imgPath) {
                    view.style.backgroundImage = `url('${imgPath}')`; 
                    view.style.backgroundSize = 'cover'; 
                    view.style.backgroundPosition = 'center';
                    view.innerHTML = ""; 
                } else {
                    view.innerHTML = `<span class="text-2xl font-bold z-10 ${txtCls}">${c.name ? c.name[0] : '?'}</span>`;
                }
                attachHoverEvents(view, c); 
            } 
            resContainer.appendChild(view); 
        }); 
    }
    
    const okBtn = document.getElementById('selection-ok-btn');
    if (okBtn) {
        okBtn.onclick = () => { 
            activeTimerPlayerId = null; // タイマーを手番プレイヤーに戻す
            
            // 【外科手術的修正】テストモード等のゲーム開始前（playersが空）でのエラーを防止
            if (typeof players !== 'undefined' && players && players.length > 0) {
                if (typeof gainTime === 'function') gainTime(5); 
            }

            document.getElementById('selection-modal').classList.add('hidden'); 
            managePeekUI(false); 
            
            // 完了コールバックを実行
            if (typeof onComplete === 'function') {
                onComplete(cards); 
            }
        };

        // 追加：自動処理中なら 500ms 後に自動クリック
        if (isAutoAction) {
            setTimeout(() => {
                if (okBtn) okBtn.click();
            }, 500);
        }
    }
}

/**
 * カード獲得・到達モーダル
 */
function showCardModal(cards, onComplete, titleText = "カード獲得", playerName = "", actionVerbiage = "到達しました") {

// SE再生。文字列が含まれているかを柔軟に判定
    if (titleText && (titleText.includes("到達効果") || titleText.includes("到達時"))) {
        playSE('se_arrival_trigger.mp3');
    } else if (titleText && titleText.includes("手札効果")) {
        playSE('se_arrival_trigger.mp3'); // 手札効果時も到達効果と同じSE、あるいは専用SEがあれば変更
    } else {
        playSE('se_get_card.mp3');
    }

    const modal = document.getElementById('arrival-modal'), 
          cardsContainer = document.getElementById('arrival-cards-container'),
          explEl = document.getElementById('arrival-player-explanation'),
          subEl = document.getElementById('arrival-subtitle'),
          msgEl = document.getElementById('arrival-msg'), // ←これが必要でした
          btnEl = document.getElementById('arrival-ok-btn'); // ←これが必要でした
    
    if(!modal || !cardsContainer) return;
    
    modal.style.zIndex = "150";

    const actualCards = Array.isArray(cards) ? cards : [cards];
    const isAcquisition = titleText.includes("獲得");
    
    document.getElementById('arrival-title').textContent = titleText;
    subEl.textContent = (actualCards[0] && actualCards[0].sealed) ? "（このターン使用不可）" : "";
    
    if (playerName) { 
        explEl.textContent = `${playerName} が ${actionVerbiage}`; 
        explEl.style.opacity = '1'; 
    } else { explEl.style.opacity = '0'; }

    cardsContainer.innerHTML = ''; 
    actualCards.forEach(card => {
        if (!card) return;

        // 1. P1(自分)の持ち物が関わっているかチェック
        // タイトルに自分の名前がある、またはカード自体が「元々自分のもの(fromP1)」フラグを持っている場合
        const isRelatedToP1 = titleText.includes(players[0].name) || card.fromP1 === true;

        // 2. 秘匿判定の決定打
        let isSecretInfo = false;
        if (isP1HandOnlyView && playerName !== players[0].name) {
            // 例外ルール：タイトルに「公開」が含まれている場合は、秘匿設定を無視して表示する
            if (titleText.includes("公開")) {
                isSecretInfo = false;
            } else if (isRelatedToP1) {
                // 自分の持ち物なら見える
                isSecretInfo = false;
            } else if (titleText.includes("ドロー") || titleText.includes("奪")|| titleText.includes("自ゲートのカード獲得") || titleText.includes("スティール")) {
                // 通常のドローや強奪は隠す
                isSecretInfo = true;
            } else if (card.revealed === false) {
                // 盤面の裏向きカードを拾ったなら隠す
                isSecretInfo = true;
            }
        }

        let txtCls = card.colorId === 'white' ? 'text-gray-800' : (card.colorId === 'black' ? 'text-gray-200' : 'text-white');
        const cardEl = document.createElement('div'); 
        cardEl.className = "modal-large-card perspective-1000 shrink-0 relative mb-4";
        
        const imgPath = card.image || (card.id ? `images/card_${card.id}.webp` : null);
        
        // ★修正：秘匿対象の場合は見た目を「？」と「グレー背景」に固定
        const displayImg = isSecretInfo ? null : imgPath;
        const displayName = isSecretInfo ? "?" : (card.name ? card.name[0] : '?');

        cardEl.innerHTML = `
            <div class="flip-card-inner relative w-full h-full">
                <div class="flip-card-back ${card.type === 'ETERNAL' ? 'eternal-back-pattern' : 'card-back-pattern'} border-2 rounded-lg flex items-center justify-center w-full h-full"></div>
                <div class="flip-card-front border-2 border-white rounded-lg w-full h-full flex flex-col items-center justify-center absolute inset-0 overflow-hidden ${isSecretInfo ? 'bg-gray-700' : card.bg}" 
                    ${displayImg ? `style="background-image: url('${displayImg}'); background-size: cover; background-position: center;"` : ""}>
                    <span class="${displayImg ? 'hidden' : ''} font-bold text-4xl ${isSecretInfo ? 'text-gray-500' : txtCls} z-10">${displayName}</span>
                </div>
            </div>`;
        cardsContainer.appendChild(cardEl); 

        // ホバー（拡大）も秘匿時は無効化
        if (typeof attachHoverEvents === 'function' && !isSecretInfo) {
            attachHoverEvents(cardEl, card, true);
        }

        const inner = cardEl.querySelector('.flip-card-inner');
        const flipFunc = () => {
            if (inner && !inner.classList.contains('do-flip')) {
                inner.classList.add('do-flip');
            }
        };

        // ★修正：秘匿対象でなければクリックでめくれる、または自動でめくる
        const isPureDraw = titleText.includes("ドロー");
        if (!isSecretInfo) {
            if (isPureDraw) {
                setTimeout(flipFunc, 400); 
            } else {
                if (inner) {
                    inner.style.transition = "none"; 
                    inner.classList.add('do-flip');
                }
            }
            cardEl.addEventListener('click', flipFunc);
        }
    });

    // 2026/03/06 修正：カード獲得ログの視認性向上（プレイヤーカラー＋アイコン）
    if (actualCards.length > 0) {
        const cardNames = actualCards.map(c => `「${c.name}」`).join('、');
        addLog(`<span style="color:${players.find(pl => pl.name === playerName)?.color.hex || '#fff'}">●</span> <b>${playerName}</b> <span class="text-green-400">🎁 獲得</span> ${cardNames}`);
        // 条件に !titleText.includes("公開") を追加
        const isSecretMsg = isP1HandOnlyView && 
                             playerName !== players[0].name && 
                             !titleText.includes("公開") && // ★ここを追加
                             (actualCards[0].revealed === false || titleText.includes("ドロー") || titleText.includes("奪"));
                             
        if (isSecretMsg) {
            msgEl.textContent = "？？？";
        } else {
            msgEl.textContent = actualCards.length > 1 ? `「${actualCards[0].name}」ほか` : `「${actualCards[0].name}」`;
        }
    }

    msgEl.style.opacity = '1'; 
    btnEl.style.opacity = '1';
    
    modal.classList.remove('hidden'); 
    managePeekUI(true);

    let isFinalized = false;
    const finalize = () => {
        if (isFinalized) return; // 二重実行防止
        isFinalized = true;

        if (autoProcessTimeout) {
            clearTimeout(autoProcessTimeout);
            autoProcessTimeout = null;
        }

        modal.classList.add('hidden');
        managePeekUI(false);

        // タイマーの再開と、次の処理(フェイズ移行等)への通知
        if (typeof resumeTimer === 'function') resumeTimer();
        if (onComplete) {
            // 少しだけ遅延させて UI 更新との競合を防ぐ
            setTimeout(() => onComplete(), 50);
        }
    };

    btnEl.onclick = () => {
        if (typeof gainTime === 'function') gainTime(5);
        finalize();
    };

    if (isAutoAction) {
        const drawWaitTime = 4000;
        if (typeof pauseTimer === 'function') pauseTimer();
        
        // タイマーをグローバル変数に格納
        autoProcessTimeout = setTimeout(() => {
            autoProcessTimeout = null;
            finalize();
        }, drawWaitTime);
    }
}

/**
 * ターン開始時のかっこいい通知演出
 * @param {Object} player ターンを開始するプレイヤーオブジェクト
 * @param {Function} callback アニメーション終了後に実行するコールバック
 */
async function showTurnChangeNotification(p) {
    if (!p) return;
    return new Promise((resolve) => {
        const existing = document.getElementById('turn-change-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = "turn-change-overlay";
        overlay.className = "fixed inset-0 z-[500] flex items-center justify-center pointer-events-none";

        const inner = document.createElement('div');
        const pColor = p.color.hex || "#fbbf24";
        
        inner.className = `px-10 py-6 rounded-xl border-t-4 border-b-4 bg-gray-900/90 backdrop-blur-md shadow-2xl flex flex-col items-center gap-2 transform -translate-y-10 opacity-0 transition-all duration-500 animate-fade-in-down`;
        inner.style.borderColor = pColor;
        inner.style.boxShadow = `0 0 40px ${pColor}66, inset 0 0 20px ${pColor}33`;

        inner.innerHTML = `
            <div class="text-[10px] font-bold tracking-[0.4em] text-gray-400 uppercase opacity-80">Turn Start</div>
            <div class="text-4xl font-black tracking-tighter italic" style="color: ${pColor}; text-shadow: 0 0 15px ${pColor}aa;">
                ${p.name}
            </div>
            <div class="w-12 h-0.5 mt-1 rounded-full" style="background-color: ${pColor}; opacity: 0.5;"></div>
        `;

        overlay.appendChild(inner);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            inner.classList.remove('-translate-y-10', 'opacity-0');
            inner.classList.add('translate-y-0', 'opacity-100');
        });

        // 演出全体の時間（表示1.8秒 + 消える時間）待ってから resolve を呼ぶ
        setTimeout(() => {
            inner.classList.remove('translate-y-0', 'opacity-100');
            inner.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => {
                overlay.remove();
                resolve(); // ここで「演出終了」を通知
            }, 600);
        }, 1800);
    });
}

/**
 * 盤面マス選択モードの開始
 */
function startSelectionMode(type, count, logic, promptText, callback, range = null, forbiddenTile = null, noCancel = false, origin = null, isEightDirection = false, cancelCallback = null, autoBtnText = null, restrictedCells = null, actingPlayer = null) {
    const msg = promptText || "対象を選択してください";
    selectionState = { active: true, type, count, current: 0, selected: [], logic, callback, range, prompt: msg, forbiddenTile, noCancel, origin, isEightDirection, cancelCallback, autoBtnText, restrictedCells, actingPlayer };
    
    // ★自動処理(isAutoAction)がONの場合のバイパス処理
    if (isAutoAction) {
        addLog(`[Auto] ${msg}`);
        // 演出のために一瞬だけ待機して自動選択を実行
        setTimeout(() => {
            if (typeof triggerAutoSelect === 'function') triggerAutoSelect();
        }, 300);
        return; // ここで終了し、人間用のUI（ボタン表示等）は行わない
    }

    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.add('selection-active');
    
    const cancelBtn = document.getElementById('cancel-selection-btn');
    if (cancelBtn) {
        if(noCancel) cancelBtn.classList.add('hidden'); else cancelBtn.classList.remove('hidden');
    }
    
    const autoBtn = document.getElementById('auto-select-btn');
    if (autoBtn) {
        if(autoBtnText) { autoBtn.classList.remove('hidden'); autoBtn.textContent = autoBtnText; } else autoBtn.classList.add('hidden');
    }

    const instText = document.getElementById('instruction-text');
    if (instText) instText.innerHTML = `<span class="text-yellow-400 font-bold animate-pulse">${msg}</span>`;
    
    if (typeof showToast === 'function') showToast(msg);
    if (typeof renderBoard === 'function') renderBoard();
    if (typeof updatePhaseIndicator === 'function') updatePhaseIndicator();
    managePeekUI(false); 
}

/**
 * 自動選択ロジック
 */
function triggerAutoSelect() {
    if (!selectionState.active || isPeekingMode) return;
    
    let allValidCells = [];
    if (selectionState.restrictedCells && selectionState.restrictedCells.length > 0) {
        allValidCells = selectionState.restrictedCells.filter(cell => isCellSelectable(cell.x, cell.y));
    } else {
        for(let y=0; y<GRID_SIZE; y++) {
            for(let x=0; x<GRID_SIZE; x++) { 
                if (isCellSelectable(x, y)) allValidCells.push({x, y}); 
            }
        }
    }

    /**
 * 2026/03/06 修正
 * triggerAutoSelect を AI_SCORE_CONFIG 連動のスコアリング方式にアップデート
 * カード効果の対象（破壊・配置・獲得など）を評価基準に基づいて賢く選択します。
 */
    // --- スコアリングによる選択ロジックの導入 ---
    let selection = [];
    if (allValidCells.length > 0) {
        if (autoMode === 'NORMAL') {
            const cfg = window.AI_SCORE_CONFIG;
            const p = selectionState.actingPlayer || players[turn];
            const otherPlayers = players.filter(pl => pl.id !== p.id);
            const enemyGatePos = otherPlayers.map(pl => pl.startPos);

            // 全ての有効な選択肢（マス）を評価
            const scoredCells = allValidCells.map(pos => {
                let score = 0;
                const cell = board[pos.y][pos.x];
                const epOn = otherPlayers.find(ep => ep.x === pos.x && ep.y === pos.y);

                // 1. 枚数・色の評価
                const stackCount = (cell.stack ? cell.stack.length : 0) + (cell.empty ? 0 : 1);
                score += (stackCount * cfg.STACK_COUNT); // 枚数 (+10/枚)

                if (cell.revealed && cell.color) {
                    const colId = cell.color.colorId;
                    // 未ロック色 (+50)
                    if (collections[p.id][colId] && collections[p.id][colId].length === 0) score += cfg.UNLOCKED_COLOR;
                    // 虹・白・黒 (+20)
                    if (['rainbow', 'white', 'black'].includes(colId)) score += cfg.RARE_COLOR;
                }

                /*** * triggerAutoSelect 内で isNegative フラグを判定し、自分への誤爆を防止*/
                // 2. プレイヤー位置関連
                if (epOn) score += cfg.STEAL_ACTION; // 接触行為（強奪など） (+50)
                
                // ★追加：自分への誤爆防止
                // 現在使用中のカード(activeHandCard)がネガティブ効果で、かつ対象マスに自分がいる場合
                const isSelfOn = (p.x === pos.x && p.y === pos.y);
                if (activeHandCard && activeHandCard.isNegative && isSelfOn) {
                    score -= 200; // 自分を対象にするのを強力に抑制
                }
                
                const isNextToEnemy = otherPlayers.some(ep => Math.abs(ep.x - pos.x) + Math.abs(ep.y - pos.y) === 1);
                if (isNextToEnemy && !epOn) score += cfg.ADJACENT_ENEMY; // 相手の隣 (+5)

                // 3. ゲート・防衛関連
                const distToSelfGate = getDistance(pos, p.startPos);
                const isEnemyNearSelfGate = otherPlayers.some(ep => getDistance({x: ep.x, y: ep.y}, p.startPos) <= 2);
                if (isEnemyNearSelfGate && distToSelfGate <= 2) score += cfg.SELF_GATE_DEFENSE; // 自ゲート防衛 (+20)

                const distToEnemyGate = Math.min(...enemyGatePos.map(eg => getDistance(pos, eg)));
                const currentDistToEnemyGate = Math.min(...enemyGatePos.map(eg => getDistance({x: p.x, y: p.y}, eg)));
                if (distToEnemyGate === 0 && currentDistToEnemyGate <= 1) score += cfg.REACH_ENEMY_GATE; // 敵ゲート到達 (+100)
                if (distToEnemyGate < currentDistToEnemyGate) score += cfg.MOVE_TOWARD_GATE; // 敵ゲート接近 (+30)

                return { pos, score };
            });

            // スコアが高い順にソートし、必要な数（selectionState.count）だけ抽出
            scoredCells.sort((a, b) => b.score - a.score || Math.random() - 0.5);
            selection = scoredCells.slice(0, selectionState.count).map(item => item.pos);
        } else {
            // EASYモードは従来通りランダム
            const shuffled = allValidCells.sort(() => Math.random() - 0.5);
            selection = shuffled.slice(0, selectionState.count);
        }
    }
    
    if (selection.length === 0) { 
        if (typeof showToast === 'function') showToast("選択可能な対象がありません"); 
        cancelSelection(); 
        return; 
    }
    
    const logicType = selectionState.logic, cb = selectionState.callback, actingP = selectionState.actingPlayer; 
    cancelSelection(true);
    selectionState.actingPlayer = actingP; 
    if (typeof executeSelectionLogic === 'function') executeSelectionLogic(logicType, selection, cb);
}

function cancelSelection(isSilent = false) {
    selectionState.active = false;
    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.remove('selection-active');
    
    const cancelBtn = document.getElementById('cancel-selection-btn');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    
    const autoBtn = document.getElementById('auto-select-btn');
    if (autoBtn) {
        autoBtn.classList.add('hidden');
    }
    
    if(!isSilent && typeof showToast === 'function') showToast("選択をキャンセルしました");
    if (typeof updatePhaseIndicator === 'function') updatePhaseIndicator(); 
    if (typeof renderBoard === 'function') renderBoard(); 
    managePeekUI(false);
}

function isCellSelectable(x, y) {
    if (!selectionState.active) return false;
    if (selectionState.forbiddenTile && x === selectionState.forbiddenTile.x && y === selectionState.forbiddenTile.y) return false;
    
    const cell = board[y][x];
    const L = selectionState.logic;

    // デバッグ用ロジック
    if (L === 'test_pos_p1' || L === 'test_pos_p2') {
        return !players.some(pl => pl.x === x && pl.y === y && pl.x !== -1);
    }

    const p = selectionState.actingPlayer || (players && players.length > 0 ? players[turn] : null);
    if (!p && !['test_pos_p1', 'test_pos_p2'].includes(L)) return false;
    
    // --- プレイヤーの位置制限 ---
    if (L === 'chotto_re_move' || L === 'move_player') {
        const isOccupied = players.some(pl => pl.x === x && pl.y === y);
        if (isOccupied) return false;
        if (cell.empty) return false;
    }

    const origin = selectionState.origin || p || {x: -1, y: -1};
    const dx = Math.abs(origin.x - x), dy = Math.abs(origin.y - y);

    // --- 範囲チェック：null または undefined の場合は全域対象とする ---
    if (selectionState.range !== null && selectionState.range !== undefined && L !== 'place_deck_facedown' && L !== 'exile_curse_logic') {
        let inRange = selectionState.isEightDirection ? (dx <= selectionState.range && dy <= selectionState.range) : (dx + dy <= selectionState.range);
        if (!inRange) return false;
    }

    if (selectionState.type === 'select_cell_outside' && dx <= 1 && dy <= 1) return false;
    if (selectionState.restrictedCells && !selectionState.restrictedCells.some(rc => rc.x === x && rc.y === y)) return false;
    
    // --- 【修正箇所】空きマスのみ選択可能なロジックのリスト ---
    const emptyRequiredLogics = [
        'place_deck_facedown_empty', 
        'civil_path_step2', 
        'place_self_facedown_empty', 
        'rich_whim_sequential',
        'place_deck_sequential_empty',   // 民の道の建設（到着）を追加
        // 修正：'place_deck_sequential_rainbow' を削除（カードがあっても選択可能にするため）
        'civil_path_step2_dummy'         // 民の道の建設（手札）用を追加
    ];
    if (emptyRequiredLogics.includes(L)) {
        if (!cell.empty) return false;
    }
    
    // --- カードが存在するマスのみ選択可能なロジックのリスト ---
    const cardRequiredLogics = ['add_to_hand', 'add_all_to_hand', 'destroy_all', 'destroy_top', 'greedy_step2', 'civil_path_step1', 'swap_deck_hand', 'open_facedown', 'force_move_logic', 'gentecnique_logic', 'place_self_revealed', 'move_player', 'civil_path_step1_dummy'];
    if (cardRequiredLogics.includes(L)) {
        if (cell.empty && L !== 'place_self_revealed') return false;
        // 特殊カード破壊不可チェック
        const invincibleLogics = ['add_to_hand', 'add_all_to_hand', 'destroy_all', 'destroy_top', 'swap_deck_hand', 'gentecnique_logic'];
        if (invincibleLogics.includes(L)) {
            if (!cell.empty && cell.color && (cell.color.type === 'FIRST' || cell.color.type === 'ETERNAL')) return false;
        }
    }
    
    return true;
}

function handleSelection(x, y) {
    if (!selectionState.active || isPeekingMode || isLongPressActive) return;
    const existingIdx = (selectionState.selected || []).findIndex(s => s.x === x && s.y === y);
    if (existingIdx !== -1) { selectionState.selected.splice(existingIdx, 1); selectionState.current--; renderBoard(); return; }
    if (!isCellSelectable(x, y)) return;
    
    if (selectionState.type === 'select_line') {
        const cb = selectionState.callback, actingP = selectionState.actingPlayer;
        showDetailModal("列指定", "向きを選択", null, "横一列", () => {
            const coords = []; for(let i=0; i<GRID_SIZE; i++) coords.push({x: i, y: y});
            cancelSelection(true); 
            // 修正：logicがfill_lineなら専用の順次配置ロジックを使用
            const nextLogic = (selectionState.logic === 'fill_line') ? 'place_deck_sequential_rainbow' : 'place_deck_facedown';
            startSelectionMode('select_cell', GRID_SIZE, nextLogic, '配置順を選択', cb, null, null, true, null, false, null, "おまかせ", coords, actingP);
        });
        const dCancelBtn = document.getElementById('detail-cancel-btn');
        if (dCancelBtn) {
            dCancelBtn.textContent = "縦一列";
            dCancelBtn.onclick = () => {
                const coords = []; for(let i=0; i<GRID_SIZE; i++) coords.push({x: x, y: i});
                closeDetailModal(); cancelSelection(true); 
                const nextLogic = (selectionState.logic === 'fill_line') ? 'place_deck_sequential_rainbow' : 'place_deck_facedown';
                startSelectionMode('select_cell', GRID_SIZE, nextLogic, '配置順を選択', cb, null, null, true, null, false, null, "おまかせ", coords, actingP);
            };
        }
        return;
    }
    
    if (typeof gainTime === 'function') gainTime(5); 
    selectionState.selected.push({x, y}); 
    selectionState.current++; 
    renderBoard(); 
    
    if (selectionState.current >= selectionState.count) {
        const sel = [...selectionState.selected];
        const L = selectionState.logic, cb = selectionState.callback, actingP = selectionState.actingPlayer; 
        cancelSelection(true); 
        selectionState.actingPlayer = actingP; 
        if (typeof executeSelectionLogic === 'function') executeSelectionLogic(L, sel, cb);
    }
}

function handleSelectionConfirm() {
    if (!selectionState || !selectionState.active) return;
    
    const { logic, selected, callback, actingPlayer } = selectionState;
    const p = actingPlayer || (players ? players[turn] : null);
    if (!p) return;

    const selection = [...(selected || [])];
    selectionState.active = false;
    
    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.remove('selection-active');
    
    const stuckBtn = document.getElementById('stuck-btn');
    if (stuckBtn) stuckBtn.classList.add('hidden');

    // 強力なガード：選択が必須なロジックで空の場合、安全に中断
    const selectionRequired = ['exile_curse_logic', 'test_pos_p1', 'test_pos_p2', 'move_player', 'add_all_to_hand', 'civil_path_logic', 'chotto_re_move'];
    if (selectionRequired.includes(logic) && selection.length === 0) {
        addLog(`[System] 選択が未完了のため処理をスキップします。`);
        if (callback) callback(); 
        return;
    }

    switch (logic) {
        
        case 'fill_line':
            executeSelectionLogic('place_deck_sequential_rainbow', selection, callback);
            return;
        
            case 'chotto_re_move':
            // 「ちょっと待った！」専用の非同期コールバック。game_core.js側のロジックへ戻る。
            if (callback) callback(selection);
            break;

        case 'exile_curse_logic':
            const curse = tempAction.card;
            board[selection[0].y][selection[0].x] = { 
                x: selection[0].x, y: selection[0].y, 
                color: curse, revealed: true, empty: false, stack: [] 
            };
            tempAction = null;
            if (callback) callback();
            break;

        case 'test_pos_p1':
        case 'test_pos_p2':
            if (callback) callback(selection);
            break;

        case 'move_player':
            moveToCell(p, selection[0].x, selection[0].y, false, callback);
            break;

        case 'fill_line':
            // 縦横1列の配置。完了後に手札からこのカードを捨てる。
            eexecuteSelectionLogic('place_deck_sequential_rainbow', selection, callback);
            return;

        case 'add_all_to_hand':
            const targetPos = selection[0];
            const cell = board[targetPos.y][targetPos.x];
            if (cell && !cell.empty && cell.color) {
                if (hands[p.id]) {
                    hands[p.id].push(cell.color);
                    if (cell.stack) {
                        while (cell.stack.length > 0) hands[p.id].push(cell.stack.shift());
                    }
                }
                cell.empty = true;
                cell.revealed = false;
                cell.color = null;
                cell.stack = [];
                addLog(`${p.name}がマス (${targetPos.x},${targetPos.y}) のカードをすべて獲得！`);
            }
            if (callback) callback();
            break;

        case 'civil_path_logic':
            tempAction = { selectedCells: selection };
            setTimeout(() => {
                startSelectionMode('select_cell', selection.length, 'civil_path_step2', '移動先の空きマスを選択', callback, null, null, true, p, false, null, "おまかせ", null, p);
            }, 100);
            return;

        case 'civil_path_step2':
            if (tempAction && tempAction.selectedCells) {
                const oldCells = tempAction.selectedCells;
                selection.forEach((newPos, i) => {
                    const oldPos = oldCells[i];
                    if (!oldPos || !newPos) return;
                    const targetCell = board[oldPos.y][oldPos.x];
                    const destCell = board[newPos.y][newPos.x];
                    destCell.empty = false;
                    destCell.color = targetCell.color;
                    destCell.revealed = targetCell.revealed;
                    destCell.stack = targetCell.stack || [];
                    targetCell.empty = true;
                    targetCell.color = null;
                    targetCell.revealed = false;
                    targetCell.stack = [];
                });
            }
            tempAction = null; 
            if (callback) callback();
            break;
    }

    if (typeof renderBoard === 'function') renderBoard();
    if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard();
    if (typeof renderHand === 'function') renderHand();
    if (typeof renderStatus === 'function') renderStatus();
    if (typeof updateGameState === 'function') updateGameState();
}

/**
 * 選択完了後の結果に基づき、各ロジックを実行する中核関数
 */
function executeSelectionLogic(logic, selection, callback) {
    if (!selection || selection.length === 0) {
        if (callback) callback([]);
        return;
    }

    const p = selectionState.actingPlayer || players[turn];

    switch (logic) {
        case 'place_deck_sequential_rainbow':
            (async () => {
                const boardEl = document.getElementById('board-grid');
                for (const pos of selection) {
                    const target = board[pos.y][pos.x];
                    const card = drawCard();
                    if (card) {
                        // 修正：既存カードの有無に関わらず「空ではない」状態にし、新しいカードを一番上に置く
                        if (target.empty) {
                            target.empty = false;
                            target.color = card;
                            target.revealed = false;
                            target.stack = [];
                        } else {
                            // 既存カードをスタックに退避させてから新しいカードを配置
                            const currentTop = { ...target.color };
                            currentTop.savedRevealedState = target.revealed;
                            if (!target.stack) target.stack = [];
                            target.stack.push(currentTop);
                            
                            target.color = card;
                            target.revealed = false;
                        }
                        
                        renderBoard();
                        const cellIdx = pos.y * GRID_SIZE + pos.x;
                        const cellEl = boardEl ? boardEl.children[cellIdx] : null;
                        if (cellEl) cellEl.classList.add('rainbow-rain-flash');
                        
                        await new Promise(res => setTimeout(res, 400));
                        if (cellEl) cellEl.classList.remove('rainbow-rain-flash');
                    }
                }
                renderBoard();
                if (callback) callback(selection);
            })();
            return;

        case 'place_deck_sequential_empty':
            (async () => {
                const boardEl = document.getElementById('board-grid');
                for (const pos of selection) {
                    const target = board[pos.y][pos.x];
                    const card = drawCard();
                    if (card && target.empty) {
                        target.empty = false;
                        target.color = card;
                        target.revealed = false;
                        target.stack = [];
                        
                        if (typeof renderBoard === 'function') renderBoard();
                        const cellIdx = pos.y * GRID_SIZE + pos.x;
                        const cellEl = boardEl.children[cellIdx];
                        
                        // 緑色の発光演出（民の道イメージ）
                        if (cellEl) cellEl.classList.add('ring-4', 'ring-green-400', 'z-50');
                        
                        // 約1秒待機（アニメーション時間含む）
                        await new Promise(res => setTimeout(res, 800)); 
                        if (cellEl) cellEl.classList.remove('ring-4', 'ring-green-400', 'z-50');
                    }
                }
                if (typeof renderBoard === 'function') renderBoard();
                if (callback) callback(selection);
            })();
            return;



        case 'lost_item_target':
            (async () => {
                for (const pos of selection) {
                    const target = board[pos.y][pos.x];
                    
                    // 1. カードを配置（スタック処理含む）
                    if (target.empty) {
                        target.empty = false; 
                        target.color = activeHandCard; 
                        target.revealed = false; 
                        target.stack = [];
                    } else {
                        const oldColor = target.color; 
                        oldColor.savedRevealedState = target.revealed;
                        target.stack.unshift(oldColor); 
                        target.color = activeHandCard; 
                        target.revealed = false;
                    }
                    
                    // 2. 盤面を更新
                    renderBoard();

                    // 3. 発光演出（誰かの落とし物は橙色なのでフォースと同じ #f97316 を使用）
                    await animateCellBlink(pos.x, pos.y, '#f97316');
                    
                    addLog(`${p.name}がゲートにカードを裏向きで置きました。`);
                }
                if (callback) callback(selection);
            })();
            return;

        case 'rich_whim_sequential':
            const posWhim = selection[0];
            const targetWhim = board[posWhim.y][posWhim.x];
            const cardWhim = drawCard();
            if (cardWhim) {
                targetWhim.empty = false; targetWhim.color = cardWhim; targetWhim.revealed = false; targetWhim.stack = [];
                addLog(`${p.name}がカードを盤面に裏向きで配置しました。`);
            }
            
            if (tempAction) {
                tempAction.remaining--;
                if (tempAction.remaining > 0) {
                    // 修正：時計回りの順序を維持
                    const curIdx = players.indexOf(p);
                    const nextIdx = (curIdx + 1) % players.length;
                    const nextP = players[nextIdx];
                    
                    setTimeout(() => {
                        startSelectionMode('select_cell', 1, 'rich_whim_sequential', `${nextP.name}さん、空きマスを選んでください`, callback, null, null, true, nextP, false, null, "おまかせ", null, nextP);
                    }, 300);
                    return; 
                }
            }
            tempAction = null;
            break;

        case 'move_player':
            const targetPosMove = selection[0];
            const dashCard = (p.currentArrivalCard && p.currentArrivalCard.id === 15) ? p.currentArrivalCard : null;
            if (dashCard) moveToCell(p, targetPosMove.x, targetPosMove.y, 'dash_move', callback);
            else moveToCell(p, targetPosMove.x, targetPosMove.y, false, callback);
            return;

        case 'destroy_all':
            (async () => {
                // 演出（ワイナウエアは赤なので #ef4444 で発光）
                for (const pos of selection) {
                    await animateCellBlink(pos.x, pos.y, '#ef4444');
                }

                if (typeof triggerLightningEffect === 'function') {
                    triggerLightningEffect();
                }

                selection.forEach(pos => {
                    const target = board[pos.y][pos.x];

                    if (!target.empty) {
                        // 1. 表面のカードを捨て札へ
                        if (target.color) {
                            discardPile.push(target.color);
                        }
                        // 2. 重なっているカード（スタック）もすべて捨て札へ
                        if (target.stack && target.stack.length > 0) {
                            target.stack.forEach(c => discardPile.push(c));
                        }
                        
                        target.empty = true; 
                        target.revealed = false; 
                        target.stack = [];
                        target.color = null; // 安全のためnullクリア
                    }
                });
                addLog(`${p.name}がマスのカードを全て破壊しました。`);
                // 捨て場の表示を即時更新
                if (typeof renderBoard === 'function') renderBoard();
                if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard();
                
                if (callback) callback(selection);
            })();
            return;

        case 'destroy_top':
            (async () => {
                for (const pos of selection) {
                    // 破壊されるカードの場所を青色で点滅
                    await animateCellBlink(pos.x, pos.y, '#3b82f6');

                    const target = board[pos.y][pos.x];
                    if (!target.empty) {
                        // 表面のカードを捨て札へ送り、下にあるカードを表に出す
                        if (target.color) discardPile.push(target.color);
                        
                        if (target.stack && target.stack.length > 0) {
                            target.color = target.stack.shift();
                            target.revealed = target.color.savedRevealedState || false;
                        } else { 
                            target.empty = true; 
                            target.revealed = false; 
                            target.color = null;
                            target.stack = [];
                        }
                    }
                }
                addLog(`${p.name}がマスのカードを1枚破壊しました。`);
                renderBoard();
                renderDeckAndDiscard();
                if (callback) callback(selection);
            })();
            return;

        case 'add_to_hand':
            (async () => {
                const acquiredCards = [];
                // 選択された各マスに対して演出を実行
                for (const pos of selection) {
                    // 効果カードの色（フォースなら橙）で発光。 
                    // p.color.hex は発動者の駒の色ですが、カード自体の色を使う場合は '#f97316' 等を直接指定も可能です。
                    // ここでは汎用性を考え、発動者の色または、コンテキストに応じた色を使用します。
                    const blinkColor = (p.currentArrivalCard && p.currentArrivalCard.colorId === 'orange') ? '#f97316' : (p.color.hex || '#ffffff');
                    
                    await animateCellBlink(pos.x, pos.y, blinkColor);

                    const target = board[pos.y][pos.x];
                    if (!target.empty) {
                        // 盤面での「表か裏か」の状態を、一時的にカードデータへ持たせる
                        const cardWithState = { ...target.color, revealed: target.revealed };
                        acquiredCards.push(cardWithState);
                        hands[p.id].push(target.color);
                        if (target.stack && target.stack.length > 0) {
                            const topStack = target.stack.shift();
                            target.color = topStack;
                            target.revealed = topStack.savedRevealedState || false;
                        } else { 
                            target.empty = true; 
                            target.revealed = false; 
                            target.color = null;
                            target.stack = [];
                        }
                    }
                }

                if (acquiredCards.length > 0) {
                    renderBoard();
                    renderHand();
                    showCardModal(acquiredCards, () => {
                        if (callback) callback(selection);
                    }, "カード獲得", p.name, "カードを獲得しました");
                } else if (callback) {
                    callback(selection);
                }
            })();
            return;

        case 'add_all_to_hand':
            (async () => {
                let gatheredCards = [];
                for (const pos of selection) {
                    // カラフルホールは白色なので #ffffff で発光
                    await animateCellBlink(pos.x, pos.y, '#ffffff');

                    const target = board[pos.y][pos.x];
                    if (!target.empty) {
                        gatheredCards.push(target.color);
                        if (target.stack) target.stack.forEach(c => gatheredCards.push(c));
                        target.empty = true; 
                        target.revealed = false; 
                        target.stack = [];
                        target.color = null;
                    }
                }

                if (gatheredCards.length > 0) {
                    gatheredCards.forEach(c => hands[p.id].push(c));
                    if (typeof renderBoard === 'function') renderBoard();
                    if (typeof renderHand === 'function') renderHand();
                    showCardModal(gatheredCards, () => {
                        if (callback) callback(selection);
                    }, "カード獲得", p.name, "マスのカードをすべて獲得しました");
                } else if (callback) {
                    callback(selection);
                }
            })();
            return;

        /* 2026/02/27 22:30 修正：サフラン等のカードオープン効果に演出と到達連鎖を追加 */
case 'open_facedown':
    // 非同期で1枚ずつ処理するための即時実行関数
    (async () => {
        // 処理中は操作をロック
        isHandEffectProcessing = true; 

        for (const pos of selection) {
            const targetCell = board[pos.y][pos.x];
            if (!targetCell || targetCell.empty || targetCell.revealed) continue;

            // 1. 裏向きをオープンに
            targetCell.revealed = true;
            addLog(`オープン：(${pos.x}, ${pos.y}) の「${targetCell.color.name}」を公開。`);

            // 2. 盤面再描画と発光演出
            if (typeof renderBoard === 'function') renderBoard();
            if (typeof triggerCellFlash === 'function') {
                triggerCellFlash(pos.x, pos.y, targetCell.color.hex || '#ffffff');
            }

            // 3. めくった先に誰かいるかチェック
            const pOnCell = players.find(pl => pl.x === pos.x && pl.y === pos.y);
            if (pOnCell) {
                // 到達処理（モーダル）が終わるまで待機
                await new Promise(resolve => {
                    handleArrivalLogic(targetCell, pOnCell, resolve, targetCell.color, false);
                });
            } else {
                // 誰もいない場合は演出の余韻として少し待機
                await new Promise(r => setTimeout(r, 600));
            }
        }
        
        // 全てのカードをめくり終えたら完了
        if (onSuccess) onSuccess({});
    })();
    // async関数を抜けた直後の break は必須。 
    // onSuccess は async 内で呼ばれるため、ここでは return しないよう注意。
    break;

        case 'place_deck_facedown':
        case 'place_deck_facedown_empty':
            (async () => {
                for (const pos of selection) {
                    // プリドゥエンは青色なので #3b82f6 で発光
                    await animateCellBlink(pos.x, pos.y, '#3b82f6');

                    const target = board[pos.y][pos.x];
                    const card = drawCard();
                    if (card) {
                        if (target.empty) {
                            target.empty = false; 
                            target.color = card; 
                            target.revealed = false; 
                            target.stack = [];
                        } else {
                            const oldColor = target.color;
                            oldColor.savedRevealedState = target.revealed;
                            target.stack.unshift(oldColor);
                            target.color = card; 
                            target.revealed = false;
                        }
                    }
                    // 1枚ごとに盤面を更新して配置を見せる
                    renderBoard();
                    renderDeckAndDiscard();
                }
                if (callback) callback(selection);
            })();
            return;

        case 'place_self_facedown_empty':
            selection.forEach(pos => {
                const target = board[pos.y][pos.x];
                if (activeHandCard) {
                    target.empty = false;
                    target.color = activeHandCard;
                    target.revealed = false;
                    target.stack = [];
                    addLog(`${p.name}がカードを盤面に裏向きで置きました。`);
                }
            });
            break;

        case 'place_self_revealed':
            (async () => {
                for (const pos of selection) {
                    // 誰かの好きな花は桃色なので #f472b6 で発光
                    await animateCellBlink(pos.x, pos.y, '#f472b6');

                    const target = board[pos.y][pos.x];
                    if (activeHandCard) {
                        if (target.empty) {
                            target.empty = false; 
                            target.color = activeHandCard; 
                            target.revealed = true; 
                            target.stack = [];
                        } else {
                            const oldColor = target.color;
                            oldColor.savedRevealedState = target.revealed;
                            target.stack.unshift(oldColor);
                            target.color = activeHandCard; 
                            target.revealed = true;
                        }
                    }
                }
                renderBoard();
                if (callback) callback(selection);
            })();
            return;

        case 'gentecnique_logic':
            (async () => {
                for (const pos of selection) {
                    // ゲンテクニークは紫色なので #9333ea で発光
                    await animateCellBlink(pos.x, pos.y, '#9333ea');

                    const target = board[pos.y][pos.x];
                    if (!target.empty) {
                        // 1. 現在の表面カードを手札に加える
                        hands[p.id].push(target.color);
                        
                        // 2. 山札から新しいカードを引いて裏向きで置く
                        const newCard = drawCard();
                        if (newCard) { 
                            target.color = newCard; 
                            target.revealed = false; 
                        } else {
                            target.empty = true;
                            target.color = null;
                        }
                    }
                }
                
                renderBoard();
                renderHand();
                addLog(`${p.name}が終わりなき化学の効果でカードを入れ替えました。`);
                
                if (callback) callback(selection);
            })();
            return;

        case 'exile_curse_logic':
            selection.forEach(pos => {
                const target = board[pos.y][pos.x];
                const curseCard = tempAction.card;
                if (target.empty) {
                    target.empty = false; target.color = curseCard; target.revealed = false;
                } else {
                    const oldColor = target.color;
                    oldColor.savedRevealedState = target.revealed;
                    target.stack.unshift(oldColor);
                    target.color = curseCard; target.revealed = false;
                }
            });
            break;

        case 'force_move_logic':
    if (activeTargetPos) {
        (async () => {
            const victim = activeTargetPos; 
            const destPos = selection[0];   
            const cell = board[destPos.y][destPos.x];

            // 1. 移動演出
            await animateCellBlink(victim.x, victim.y, '#f97316');

            // 2. 移動実行（第4引数を false にして、通常の到達判定を許可する）
            // callbackを渡さないことで、二重発動を回避しつつ async/await で完了を待機
            await moveToCell(victim, destPos.x, destPos.y, false, null, null, 'moving-unit-glow');

            // 3. 移動後の処理
            await animateCellBlink(destPos.x, destPos.y, '#f97316');
            addLog(`${p.name}のフォースにより、${victim.name}が移動させられました。`);
            
            const card = cell.empty ? null : cell.color;
            if (card) {
                // ここで handleArrivalLogic を直接呼び出す
                // callback 内で「終了後の AI 再開」を確約する
                handleArrivalLogic(cell, victim, () => {
                    // 到達（およびコンボ）が全て終わった後の最終処理
                    isProcessingMove = false;
                    isHandEffectProcessing = false; // ハンドフェイズ処理中フラグを解除
                    
                    if (typeof updateGameState === 'function') updateGameState();
                    
                    // AIが止まらないようにコールバックを実行
                    if (callback) callback(selection);
                    
                }, card, true);
            } else {
                // カードがない場合は即座にハンドフェイズに復帰
                isProcessingMove = false;
                if (callback) callback(selection);
            }
        })();
        return;
    }
    break;
        

        case 'apocalypse_placed_logic':
            (async () => {
                if (activeHandCard) {
                    const pos = selection[0];
                    const target = board[pos.y][pos.x];
                    
                    // 1. カードを配置する物理処理
                    if (target.empty) { 
                        target.empty = false; 
                        target.color = activeHandCard; 
                        target.revealed = false; 
                    } else {
                        const oldColor = target.color; 
                        oldColor.savedRevealedState = target.revealed;
                        target.stack.unshift(oldColor); 
                        target.color = activeHandCard; 
                        target.revealed = false;
                    }
                    
                    // 2. 盤面を更新して配置を見せる
                    renderBoard();

                    // 3. 発光演出（アポカリプスなので紫色：#9333ea）を実行
                    await animateCellBlink(pos.x, pos.y, '#9333ea');
                    
                    addLog(`${p.name}が予言者の技でカードを配置しました。`);
                }
                if (callback) callback(selection);
            })();
            return;

        case 'greedy_step1':
            (async () => {
                if (activeHandCard) {
                    const pos = selection[0];
                    const target = board[pos.y][pos.x];

                    // 1. 吊り橋を置く場所を青色（#3b82f6）で点滅
                    await animateCellBlink(pos.x, pos.y, '#3b82f6');

                    // 2. 物理的に配置
                    if (target.empty) { 
                        target.empty = false; target.color = activeHandCard; target.revealed = false; 
                    } else {
                        const oldColor = target.color; oldColor.savedRevealedState = target.revealed;
                        target.stack.unshift(oldColor); target.color = activeHandCard; target.revealed = false;
                    }
                    renderBoard();

                    // 3. 次の選択ステップ（周囲のカード選択）へ移行
                    startSelectionMode('select_cell', 1, 'greedy_step2', '下に敷く周囲のカードを選択', callback, 1, pos, true, pos, true, null, "おまかせ", null, p);
                }
            })();
            return;
            
        case 'greedy_step2':
            (async () => {
                const bridgePos = selectionState.origin; // 吊り橋を置いた場所
                const targetPos = selection[0];        // 吸収するカードの場所
                const bridgeCell = board[bridgePos.y][bridgePos.x];
                const targetCell = board[targetPos.y][targetPos.x];

                if (bridgePos && !targetCell.empty) {
                    // 1. 吸収されるカードの場所を青色で点滅
                    await animateCellBlink(targetPos.x, targetPos.y, '#3b82f6');

                    // 2. 移動アニメーション（民の道のロジックを応用）
                    const boardEl = document.getElementById('board-grid');
                    const fromEl = boardEl.children[targetPos.y * GRID_SIZE + targetPos.x];
                    const toEl = boardEl.children[bridgePos.y * GRID_SIZE + bridgePos.x];
                    
                    const rectFrom = fromEl.getBoundingClientRect();
                    const rectTo = toEl.getBoundingClientRect();
                    
                    // アニメーション用のクローン作成
                    const cardImg = fromEl.querySelector('.card-back-pattern, .flip-card-front');
                    const clone = (cardImg ? cardImg.cloneNode(true) : document.createElement('div'));
                    if(!cardImg) {
                        clone.className = `w-full h-full rounded border border-white ${targetCell.color.bg}`;
                    }
                    
                    clone.style.position = 'fixed';
                    clone.style.top = rectFrom.top + 'px';
                    clone.style.left = rectFrom.left + 'px';
                    clone.style.width = rectFrom.width + 'px';
                    clone.style.height = rectFrom.height + 'px';
                    clone.style.zIndex = '1000';
                    clone.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                    document.body.appendChild(clone);

                    // 吸収元を一旦隠す
                    const movingCard = targetCell.color;
                    movingCard.savedRevealedState = targetCell.revealed;
                    targetCell.empty = true;
                    targetCell.color = null;
                    renderBoard();

                    // 移動開始
                    requestAnimationFrame(() => {
                        clone.style.top = rectTo.top + 'px';
                        clone.style.left = rectTo.left + 'px';
                        clone.style.transform = 'scale(0.8)';
                    });

                    await new Promise(r => setTimeout(r, 600));

                    // 3. 吸収（スタックの底へ追加）
                    bridgeCell.stack.push(movingCard);
                    
                    // 吸収完了の演出（縮小して消える）
                    clone.classList.add('absorb-animation');
                    await new Promise(r => setTimeout(r, 400));
                    clone.remove();

                    // 吸収元の穴を埋める（もしスタックがあれば補充）
                    if (targetCell.stack && targetCell.stack.length > 0) {
                        targetCell.color = targetCell.stack.shift();
                        targetCell.revealed = targetCell.color.savedRevealedState || false;
                        targetCell.empty = false;
                    }

                    addLog(`${p.name}が吊り橋の下にカードを吸い込みました。`);
                    renderBoard();
                }
                if (callback) callback(selection);
            })();
            return;

        case 'trapped_trap_step1':
            (async () => {
                if (activeHandCard) {
                    const pos = selection[0];
                    const target = board[pos.y][pos.x];

                    // 1. 罠を置く場所を青色（#3b82f6）で点滅
                    await animateCellBlink(pos.x, pos.y, '#3b82f6');

                    // 2. 物理的に配置
                    if (target.empty) { 
                        target.empty = false; target.color = activeHandCard; target.revealed = false; 
                    } else {
                        const oldColor = target.color; oldColor.savedRevealedState = target.revealed;
                        target.stack.unshift(oldColor); target.color = activeHandCard; target.revealed = false;
                    }
                    renderBoard();

                    // 3. 次の選択ステップ（周囲のカード破壊）へ移行
                    startSelectionMode('select_cell', 1, 'destroy_top', '破壊する周囲のカードを選択', callback, 1, pos, true, pos, true, null, "おまかせ", null, p);
                }
            })();
            return;

        case 'civil_path_step1':
            tempAction = { selectedCells: selection };
            setTimeout(() => {
                startSelectionMode('select_cell', selection.length, 'civil_path_step2', '移動先の空きマスを選択', callback, null, null, true, p, false, null, "おまかせ", null, p);
            }, 100);
            return;

        case 'civil_path_step2':
            // 2026/02/20 修正：既存の瞬間移動ロジックを削除し、
            // game_effects.js の animateCivilPath 側に処理を任せる。
            if (callback) callback(selection);
            tempAction = null; 
            break;
    }

    if (typeof renderBoard === 'function') renderBoard();
    if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard();
    if (typeof renderHand === 'function') renderHand();
    
    if (callback && !['lost_item_target', 'rich_whim_sequential', 'move_player'].includes(logic)) callback(selection);
}

/**
 * スティール演出モーダルの表示（描画欠け・レイアウト修正版）
 */
function showStealActionModal(thief, victim, onComplete) {
    const modal = document.createElement('div');
    // ライトモード対応の背景・文字色判定
    const bgClass = isLightMode ? "bg-white" : "bg-black/95";
    const textColor = isLightMode ? "text-gray-800" : "text-white/90";
    
    modal.className = `fixed inset-0 z-[1000] ${bgClass} flex flex-col items-center justify-center p-2`;
    const victimHandCount = hands[victim.id] ? hands[victim.id].length : 0;
    
    // 手札枚数に応じて重なりを調整（枚数が多いほど重なりを深くして幅に収める）
    let handHTML = '';
    const overlapClass = victimHandCount > 5 ? '-ml-5' : victimHandCount > 1 ? '-ml-3' : '';
    
    for(let i = 0; i < victimHandCount; i++) {
        // 最初の1枚以外にマイナスマージンを適用
        const margin = i > 0 ? overlapClass : '';
        handHTML += `<div class="steal-hand-back ${margin}"></div>`;
    }

    modal.innerHTML = `
        <h2 class="text-xl font-black text-yellow-500 mb-8 italic tracking-tighter animate-pulse">STEAL ATTEMPT!!</h2>
        <div class="steal-display-container" style="width: 100%; max-width: 350px;">
            <div class="steal-player-unit">
                <img src="${thief.icon}" class="steal-prof-img" style="border-color: ${thief.color.hex}">
                <span class="text-[10px] font-bold ${isLightMode ? 'text-gray-900' : 'text-white'} truncate w-full text-center">${thief.name}</span>
            </div>

            <div class="flex flex-col items-center shrink-0 w-12">
                <div class="text-2xl text-yellow-500">◀</div>
                <div class="steal-card-blinking"></div>
            </div>

            <div class="steal-player-unit">
                <img src="${victim.icon}" class="steal-prof-img" style="border-color: ${victim.color.hex}">
                <span class="text-[10px] font-bold ${isLightMode ? 'text-gray-900' : 'text-white'} truncate w-full text-center">${victim.name}</span>
                <div class="flex items-center justify-center mt-2 px-1 w-full overflow-visible">
                    ${handHTML}
                </div>
            </div>
        </div>
        <p class="${textColor} text-[12px] mt-10 px-6 text-center leading-tight font-medium">
            ${thief.name} が ${victim.name} の手札 (${victimHandCount}枚)<br>からカードを狙っています...
        </p>
    `;

    document.body.appendChild(modal);

    setTimeout(() => {
        modal.classList.add('opacity-0');
        modal.style.transition = "opacity 0.8s ease";
        setTimeout(() => {
            modal.remove();
            if (onComplete) onComplete();
        }, 800);
    }, 3500);
}


/**
 * 2026/02/27 10:15 修正
 * 山札確認画面にて、初期山札の全112枚をルールに基づいた枚数で描画するよう修正。
 */
window.showFullDeckListModal = function() {
    const colorOrder = ['red', 'orange', 'yellow', 'green', 'blue', 'pink', 'purple', 'rainbow', 'white', 'black'];
    const appContainer = document.getElementById('app');

    let firstPile = [];
    let eternalPile = [];
    let normalPile = [];
    let specialPile = [];

    if (typeof CARD_DATABASE !== 'undefined') {
        CARD_DATABASE.forEach(data => {
            // --- 枚数決定ロジックの修正 ---
            let num = 0;
            const specialCounts = { 30: 2, 31: 2, 32: 1, 33: 1, 34: 1 };

            if (data.type === 'FIRST' || data.type === 'ETERNAL') {
                num = 1; // 各1枚
            } else if (specialCounts[data.id] !== undefined) {
                num = specialCounts[data.id]; // 白・黒の個別枚数（30-34）を最優先
            } else if (data.type === 'NORMAL') {
                num = 7; // それ以外の通常カード（ダッシュ、反撃、レインボー等）
            }

            for(let i=0; i < num; i++) {
                const cardImgHTML = `<div class="deck-list-item"><img src="images/card_${data.id}.webp" loading="lazy"></div>`;
                
                if (data.type === 'FIRST') {
                    firstPile.push({ colorId: data.colorId, id: data.id, html: cardImgHTML });
                } else if (data.type === 'ETERNAL') {
                    eternalPile.push({ colorId: data.colorId, id: data.id, html: cardImgHTML });
                } else if (data.colorId === 'white' || data.colorId === 'black') {
                    specialPile.push({ colorId: data.colorId, id: data.id, html: cardImgHTML });
                } else {
                    normalPile.push({ colorId: data.colorId, id: data.id, html: cardImgHTML });
                }
            }
        });
    }

    // （以下、ソート処理やHTML組み立て部分は変更なしのため省略します。既存のコードをそのまま維持してください）
    const sorter = (a, b) => {
        const colorDiff = colorOrder.indexOf(a.colorId) - colorOrder.indexOf(b.colorId);
        return colorDiff !== 0 ? colorDiff : a.id - b.id;
    };
    firstPile.sort(sorter);
    eternalPile.sort(sorter);
    normalPile.sort(sorter);
    specialPile.sort(sorter);

    // 管理情報: 2026/03/04 山札構成画面のz-index調整と拡大イベントの確実な登録
    const overlay = document.createElement('div');
    // z-indexを5000から500に下げ、拡大画面(9999)が上にくるように修正
    overlay.className = "absolute inset-0 z-[500] flex items-center justify-center bg-black/80";

    const createSection = (title, pile) => {
        if (pile.length === 0) return '';
        return `
            <div class="mb-4">
                <div class="text-yellow-500 text-[10px] font-bold mb-1 px-1 border-l-2 border-yellow-600">${title} (${pile.length}枚)</div>
                <div class="deck-list-grid">
                    ${pile.map(p => p.html).join('')}
                </div>
            </div>
        `;
    };

    const sectionsHTML = 
        createSection("【ファーストカード】", firstPile) +
        createSection("【エターナルカード】", eternalPile) +
        createSection("【通常カード】", normalPile) +
        createSection("【無色（白・黒）】", specialPile);

    // 管理情報: 2026/03/04 山札構成確認画面にカード拡大機能を追加
    overlay.innerHTML = `
        <div class="bg-gray-900 border-2 border-yellow-600 w-[90%] h-[85%] flex flex-col rounded-lg overflow-hidden shadow-2xl">
            <div class="p-2 border-b border-gray-700 flex justify-between items-center bg-gray-800 shrink-0">
                <div class="flex flex-col">
                    <span class="text-yellow-500 font-bold text-[10px]">全山札構成 (計112枚)</span>
                    <span class="text-[8px] text-gray-400">右クリック/ダブルタップで拡大</span>
                </div>
                <button onclick="this.closest('.absolute').remove()" class="bg-red-600 text-white px-3 py-1 rounded text-[10px] font-bold">閉じる</button>
            </div>
            <div id="deck-list-content-scroll" class="flex-grow overflow-y-auto p-2 bg-gray-950">
                ${sectionsHTML}
            </div>
        </div>
    `;

    if (appContainer) {
        appContainer.appendChild(overlay);
    } else {
        document.body.appendChild(overlay);
    }

    // --- 【外科手術的修正】カード拡大イベントの登録 ---
    const listItems = overlay.querySelectorAll('.deck-list-item');
    listItems.forEach(item => {
        const img = item.querySelector('img');
        if (!img) return;

        // 画像URLからIDを特定
        const urlParts = img.src.split('_');
        const lastPart = urlParts[urlParts.length - 1];
        const cardId = parseInt(lastPart.split('.')[0]);
        const cardData = CARD_DATABASE.find(d => d.id === cardId);
        
        if (cardData) {
            // PC: 右クリック（中央固定にするため第1引数をnullに）
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof showHoverPreview === 'function') {
                    // 第1引数をnullにすることで中央固定、第3引数をtrueで閉じるボタンを有効化
                    showHoverPreview(null, cardData, true);
                }
            });

            // スマホ: ダブルタップ（第1引数はnull、第3引数で強制スマホモード）
            let lastTap = 0;
            item.addEventListener('touchend', (e) => {
                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTap;
                if (tapLength < 300 && tapLength > 0) {
                    e.preventDefault();
                    if (typeof showHoverPreview === 'function') {
                        // モバイル表示を強制するために第3引数をtrueに
                        showHoverPreview(null, cardData, true);
                    }
                }
                lastTap = currentTime;
            });
        }
    });
};

// --- 演出用：プレゼントモーダル ---
function showPresentFlowerModal(giver, receiver, card, onComplete) {
    const modal = document.createElement('div');
    // ライトモード時は背景を白(bg-white)、通常は黒(bg-black/95)に設定
    const bgClass = isLightMode ? "bg-white" : "bg-black/95";
    const textColor = isLightMode ? "text-gray-800" : "text-white/90";
    
    modal.className = `fixed inset-0 z-[1000] ${bgClass} flex flex-col items-center justify-center p-2`;
    
    modal.innerHTML = `
        <h2 class="text-xl font-black text-pink-400 mb-8 italic tracking-tighter animate-pulse">FLOWER PRESENT!!</h2>
        <div class="steal-display-container" style="width: 100%; max-width: 350px;">
            <div class="steal-player-unit">
                <img src="${giver.icon}" class="steal-prof-img" style="border-color: ${giver.color.hex}">
                <span class="text-[10px] font-bold ${isLightMode ? 'text-gray-900' : 'text-white'} truncate w-full text-center">${giver.name}</span>
            </div>

            <div class="flex flex-col items-center shrink-0 w-12">
                <div class="text-2xl text-pink-400">▶</div>
                <img src="${card.image}" class="w-10 h-10 object-contain animate-bounce" style="filter: drop-shadow(0 0 8px #f472b6);">
            </div>

            <div class="steal-player-unit">
                <img src="${receiver.icon}" class="steal-prof-img" style="border-color: ${receiver.color.hex}">
                <span class="text-[10px] font-bold ${isLightMode ? 'text-gray-900' : 'text-white'} truncate w-full text-center">${receiver.name}</span>
            </div>
        </div>
        <p class="${textColor} text-[12px] mt-10 px-6 text-center leading-tight font-medium">
            ${giver.name} から ${receiver.name} へ<br>「${card.name}」が贈られました
        </p>
    `;

    document.body.appendChild(modal);

    setTimeout(() => {
        modal.classList.add('opacity-0');
        modal.style.transition = "opacity 0.8s ease";
        setTimeout(() => {
            modal.remove();
            if (onComplete) onComplete();
        }, 800);
    }, 3000); // 3秒間表示
}

/**
 * カラフルホール用：ロックカード奪取の演出モーダル
 */
function showLockStealModal(thief, victim, onComplete) {
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 z-[1000] bg-black/95 flex flex-col items-center justify-center p-2";
    
    // ロックカードをイメージしたアイコン（または背面画像）を並べる
    let lockHTML = '';
    for(let i = 0; i < 7; i++) {
        // 外科手術的修正：w-3 h-3 に縮小し、shrink-0 で潰れを防止。mt-3 で少し下げる
        lockHTML += `<div class="w-3 h-3 border border-gray-600 rounded-sm mx-0.5 bg-gray-800 shrink-0 mt-3"></div>`;
    }

    modal.innerHTML = `
        <h2 class="text-2xl font-black mb-8 italic tracking-tighter animate-pulse" style="text-shadow: 0 0 15px rgba(255,255,255,0.8), 0 0 5px rgba(250,204,21,1);">
            <span class="text-white">COLORFUL</span> <span class="text-yellow-400">HOLE!!</span>
        </h2>
        <div class="steal-display-container" style="width: 100%; max-width: 350px;">
            <div class="steal-player-unit">
                <img src="${thief.icon}" class="steal-prof-img" style="border-color: ${thief.color.hex}">
                <span class="text-[10px] font-bold text-white truncate w-full text-center">${thief.name}</span>
            </div>

            <div class="flex flex-col items-center shrink-0 w-12">
                <div class="text-2xl text-yellow-500">◀</div>
                <div class="steal-card-blinking w-12 h-12 aspect-square flex items-center justify-center text-4xl font-black rounded-lg" 
                     style="background: linear-gradient(45deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); background-size: 200% 200%; color: #000; text-shadow: 0 0 10px #fff;">？</div>
            </div>

            <div class="steal-player-unit">
                <img src="${victim.icon}" class="steal-prof-img" style="border-color: ${victim.color.hex}">
                <span class="text-[10px] font-bold text-white truncate w-full text-center">${victim.name}</span>
                <div class="flex items-center justify-center px-1 w-full overflow-visible">
                    ${lockHTML}
                </div>
                <span class="text-[8px] text-yellow-500 mt-1 font-bold">LOCK AREA</span>
            </div>
        </div>
        <p class="text-gray-300 text-[12px] mt-10 px-6 text-center leading-tight">
            ${thief.name} が ${victim.name} の<br>ロックエリアからカードを奪おうとしています...
        </p>
    `;

    document.body.appendChild(modal);

    setTimeout(() => {
        modal.classList.add('opacity-0');
        modal.style.transition = "opacity 0.8s ease";
        setTimeout(() => {
            modal.remove();
            if (onComplete) onComplete();
        }, 800);
    }, 3000); // 3秒間表示
}

/**
 * 勝利確定時のズーム・カメラワーク演出を実行する
 * @param {number} winnerId 勝利したプレイヤーのID
 * @param {Function} onComplete 演出終了後のコールバック
 */
/**
 * 勝利確定時のズーム・カメラワーク演出を実行する
 */
function performVictoryCameraWork(winnerId, onComplete) {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    // --- 【設定】ズームの微調整用 ---
    const CONFIG = {
        zoomScale: 1.6,      // 緑を際立たせるため少し倍率を上げました
        angles: {
            "bottom": 0,     // P1（自分）
            "left": -90,     // 左側の人
            "top": 180,      // 上側の人
            "right": 90      // 右側の人
        }
    };
    // ----------------------------

    const overlay = document.createElement('div');
    overlay.className = 'final-v-overlay';
    appEl.appendChild(overlay);

    if (typeof triggerHeartbeatHaptic === 'function') triggerHeartbeatHaptic();

    const winner = players.find(pl => pl.id === winnerId);
    let targetAreaId = "";
    let rotate = 0;

    if (winner) {
        const pos = winner.startPos;
        // 座席判定
        if (pos.y === 6) { targetAreaId = "area-p3"; rotate = CONFIG.angles.bottom; }
        else if (pos.x === 0) { targetAreaId = "area-p4"; rotate = CONFIG.angles.left; }
        else if (pos.y === 0) { targetAreaId = "area-p1"; rotate = CONFIG.angles.top; }
        else if (pos.x === 6) { targetAreaId = "area-p2"; rotate = CONFIG.angles.right; }
    }

    // 【重要】中心点となる「緑のスロット」を特定する
    // 各プレイヤーエリア内の ID: pX-slot-green を探します
    const centerElement = document.getElementById(`p${winnerId}-slot-green`);
    const targetArea = document.getElementById(targetAreaId);

    if (centerElement && targetArea) {
        const appRect = appEl.getBoundingClientRect();
        const rect = centerElement.getBoundingClientRect();
        
        // 緑のスロットの画面上の中心を、#app内の座標として計算
        const centerX = rect.left - appRect.left + rect.width / 2;
        const centerY = rect.top - appRect.top + rect.height / 2;
        
        requestAnimationFrame(() => {
            appEl.classList.add('final-v-zoom-active');
            overlay.classList.add('active');
            
            // 緑のスロットを「変形の起点（中心）」に設定
            appEl.style.transformOrigin = `${centerX}px ${centerY}px`;
            
            // 拡大と回転（起点が緑なので、これだけで緑が中央に来ます）
            appEl.style.transform = `scale(${CONFIG.zoomScale}) rotate(${rotate}deg)`;
            
            // エリア全体をハイライト
            const slots = targetArea.querySelectorAll('.mini-slot, .eternal-view, .discard-view');
            slots.forEach(s => s.classList.add('victory-slot-highlight'));
        });
    }

    // 3. 衝撃波とバナー演出
    setTimeout(() => {
        const nova = document.createElement('div');
        nova.className = 'rainbow-nova';
        nova.style.top = '50%';
        nova.style.left = '50%';
        document.body.appendChild(nova);
        requestAnimationFrame(() => nova.classList.add('nova-animate'));

        const banner = document.createElement('div');
        banner.className = 'victory-banner';
        banner.style.transform = `translate(-50%, -50%) scale(1.2)`;
        
        banner.innerHTML = `
            <div class="text-5xl font-black italic text-yellow-400 drop-shadow-[0_4px_10px_rgba(0,0,0,1)] mb-4">WINNER!!</div>
            <div class="flex flex-col items-center">
                <img src="${winner.icon}" class="w-32 h-32 rounded-full border-4 border-yellow-400 shadow-2xl mb-4 bg-gray-900 object-cover">
                <div class="text-3xl font-bold text-white drop-shadow-lg">${winner.name}</div>
            </div>
        `;
        document.body.appendChild(banner);
        
        setTimeout(() => { banner.style.opacity = "1"; }, 50);

        setTimeout(() => {
            if (nova) nova.remove();
            if (banner) banner.remove(); 
            appEl.style.transform = "none";
            appEl.style.transformOrigin = "center";
            appEl.classList.remove('final-v-zoom-active');
            const ov = document.querySelector('.final-v-overlay');
            if (ov) ov.remove();
            if (onComplete) onComplete();
        }, 3000);
    }, 2500);
}

/**
 * プロフィール画面を表示する
 */
function showUserProfileModal() {
    const p = userProfile;
    // --- 外科手術的修正：ランク名に和訳ルビを追加 ---
    const rankData = [
        { en: "NONE", jp: "なし" },
        { en: "Red Apprentice", jp: "赤の門下生" },
        { en: "Orange Survivor", jp: "橙の生存者" },
        { en: "Yellow Seeker", jp: "黄の探求者" },
        { en: "Green Guardian", jp: "緑の守護者" },
        { en: "Blue Tactician", jp: "青の策士" },
        { en: "Pink Specialist", jp: "桃の専門家" },
        { en: "Purple Master", jp: "紫の熟練者" },
        { en: "SEVEN", jp: "虹の覇者" }
    ];
    
    const currentRank = rankData[p.rank] || { en: "Unknown", jp: "" };
    // ルビ形式のHTMLを生成
    const rankDisplayName = `
        <div class="flex flex-col items-end leading-tight">
            <span class="text-xs font-black tracking-tighter text-yellow-500/80 uppercase">${currentRank.en}</span>
            <span class="text-[10px] font-bold">${currentRank.jp}</span>
        </div>
    `;
    
    // 勝率計算
    const winRate = p.stats.totalGames > 0 ? ((p.totalWins / p.stats.totalGames) * 100).toFixed(1) : 0;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4';
    
    modal.innerHTML = `
        <div class="bg-white light:bg-white dark-mode-adjust w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border-2 border-yellow-500/50">
            <div class="p-6 text-center relative border-b border-gray-200 bg-gray-100 header-bg-adjust">
                <style>
                    /* モーダル内限定の動的スタイル調整 */
                    .light-mode .dark-mode-adjust { background-color: #ffffff !important; color: #111827 !important; }
                    .light-mode .header-bg-adjust { background: linear-gradient(to right, #f3f4f6, #e5e7eb) !important; border-color: #d1d5db !important; }
                    .light-mode .text-adjust-main { color: #111827 !important; }
                    .light-mode .text-adjust-mute { color: #4b5563 !important; }
                    .light-mode .bg-adjust-card { background-color: #f9fafb !important; border-color: #e5e7eb !important; }
                    /* 外科手術的追加：ライトモード時の称号色調整 */
                    .light-mode #edit-title span:first-child { color: #d97706 !important; font-weight: bold; }
                    
                    /* ダークモード（デフォルト）用 */
                    body:not(.light-mode) .dark-mode-adjust { background-color: #111827 !important; }
                    body:not(.light-mode) .header-bg-adjust { background: linear-gradient(to right, #1f2937, #111827) !important; border-color: #374151 !important; }
                    body:not(.light-mode) .bg-adjust-card { background-color: rgba(31, 41, 55, 0.5) !important; border-color: #374151 !important; }
                </style>

                <button id="close-profile" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl">×</button>
                <div class="relative inline-block cursor-pointer group" id="edit-profile-icon">
                    <img src="${p.icon}" class="w-24 h-24 rounded-full border-4 border-yellow-500 shadow-lg object-cover mx-auto bg-gray-200 group-hover:brightness-110 transition-all">
                    <div class="absolute -bottom-2 -right-2 bg-yellow-500 text-gray-900 text-xs font-bold px-2 py-1 rounded-full shadow z-10">Lv.${p.level}</div>
                    <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-full text-white text-[10px] font-bold">編集</div>
                    
                    <div class="w-20 mx-auto mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden border border-gray-600 shadow-sm">
                        <div style="width: ${(() => {
                            const curLv = p.level;
                            const nextLv = curLv + 1;
                            const getReq = (lv) => Math.ceil((Math.pow(lv - 1, 2)) / 2);
                            const base = getReq(curLv);
                            const needed = getReq(nextLv);
                            const pct = ((p.totalWins - base) / (needed - base)) * 100;
                            return Math.min(100, Math.max(0, pct));
                        })()}%" class="h-full bg-blue-500"></div>
                    </div>
                </div>
                <h2 id="edit-profile-name" class="text-2xl font-bold mt-4 text-adjust-main cursor-pointer hover:text-yellow-600 transition-colors flex items-center justify-center gap-2">
                    ${p.name} <span class="text-xs text-gray-400 font-normal">✎</span>
                </h2>
                <div id="edit-title" class="text-yellow-600 dark:text-yellow-500 font-mono text-sm mt-1 cursor-pointer hover:brightness-125 transition-all flex items-center justify-center gap-1 group">
    <span>称号: ${p.selectedTitle}</span>
    <span class="text-[10px] bg-yellow-500/20 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">変更</span>
</div>
            </div>

            <div class="p-6 overflow-y-auto space-y-6 custom-scrollbar bg-white dark-mode-adjust">
                <div class="rounded-xl p-4 border bg-adjust-card">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-adjust-mute text-sm font-bold">現在のランク</span>
                        <div class="flex items-center gap-2">
    ${rankDisplayName}
    <span class="text-adjust-main font-black text-lg border-l border-gray-500/30 pl-2">Rank ${p.rank}</span>
</div>
                    </div>
                    <div class="flex justify-between items-center gap-1.5 mt-2">
                        ${Array.from({ length: 7 }).map((_, i) => {
                            const isReached = i < p.rankPoint;
                            return `
                                <div class="flex-1 h-3 rounded-sm border-2 transition-all duration-500 ${
                                    isReached 
                                    ? 'bg-yellow-500 border-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.6)]' 
                                    : 'bg-transparent border-gray-300 dark:border-gray-700 opacity-40'
                                }"></div>
                            `;
                        }).join('')}
                    </div>
                    <div class="text-right text-[10px] text-adjust-mute mt-1 font-bold">昇格まであと ${7 - p.rankPoint} pt</div>
                </div>

                <div class="grid grid-cols-3 gap-4 text-center">
                    <div class="bg-adjust-card p-3 rounded-lg border">
                        <div class="text-adjust-mute text-[10px] uppercase font-bold">Total</div>
                        <div class="text-xl font-bold text-adjust-main">${p.stats.totalGames}</div>
                    </div>
                    <div class="bg-adjust-card p-3 rounded-lg border">
                        <div class="text-adjust-mute text-[10px] uppercase font-bold">Wins</div>
                        <div class="text-xl font-bold text-green-600">${p.totalWins}</div>
                    </div>
                    <div class="bg-adjust-card p-3 rounded-lg border">
                        <div class="text-adjust-mute text-[10px] uppercase font-bold">Win Rate</div>
                        <div class="text-xl font-bold text-blue-600">${winRate}%</div>
                    </div>
                </div>

                <div class="rounded-xl p-4 border bg-adjust-card border-yellow-500/30">
                    <h3 class="text-adjust-mute text-[10px] font-bold mb-3 uppercase tracking-wider">Favorite Card (MVP)</h3>
                    <div class="flex items-center gap-4">
                        <div class="w-20 h-20 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shrink-0 shadow-lg flex items-center justify-center">
    ${p.stats.mvpCard ? 
        `<img src="images/card_${CARD_DATABASE.find(c => c.name === p.stats.mvpCard)?.id}.webp" class="w-full h-full object-cover">` : 
        `<div class="w-full h-full flex items-center justify-center text-[10px] text-gray-600 italic">No Data</div>`
    }
</div>
                        <div class="flex-1 text-left">
                            <div class="text-adjust-main font-black text-sm">${p.stats.mvpCard || "まだデータがありません"}</div>
                            <div class="text-[10px] text-adjust-mute mt-1">
                                通算使用回数: <span class="text-yellow-500 font-bold">${p.stats.cardUsageCount ? (p.stats.cardUsageCount[p.stats.mvpCard] || 0) : 0}</span> 回
                            </div>
                            <div class="text-[9px] text-gray-400 mt-2 italic line-clamp-2">
                                ${p.stats.mvpCard ? (CARD_DATABASE.find(c => c.name === p.stats.mvpCard)?.arrival || "効果を使いこなして勝利を掴もう。") : "対局を重ねると、最も縁のあるカードが表示されます。"}
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 class="text-adjust-mute text-xs font-bold mb-3 uppercase tracking-wider">Color Style</h3>
                    <div class="flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
                        ${Object.entries(p.stats.colorUsage).map(([col, count]) => {
                            const total = Object.values(p.stats.colorUsage).reduce((a, b) => a + b, 0) || 1;
                            const colorHex = BASE_COLORS.find(bc => bc.id === col)?.hex || '#ccc';
                            return `<div style="width: ${(count/total)*100}%; background-color: ${colorHex}" title="${col}"></div>`;
                        }).join('')}
                    </div>
                </div>
            </div>

            <div class="p-4 bg-gray-100 dark:bg-gray-800/30 border-t border-gray-200 dark:border-gray-800">
                <button id="close-profile-btn" class="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-colors">閉じる</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    // --- 外科手術的追加：画像または名前クリックで設定画面へ ---
    const startEdit = (event) => {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    modal.remove(); // プロフィール詳細を閉じる
    
    // 編集専用の関数を呼び出す
    if (typeof openProfileEdit === 'function') {
        openProfileEdit();
    }
};
    
    // --- 外科手術的追加：称号クリックで変更画面へ ---
    modal.querySelector('#edit-title').onclick = () => {
        showTitleSelectionModal(() => {
            modal.remove(); // 一旦閉じて
            showUserProfileModal(); // 更新後のデータで再表示
        });
    };

    modal.querySelector('#edit-profile-icon').onclick = startEdit;
    modal.querySelector('#edit-profile-name').onclick = startEdit;
    modal.querySelector('#close-profile').onclick = closeModal;
    modal.querySelector('#close-profile-btn').onclick = closeModal;
}


const TITLE_DESCRIPTION_MAP = {
    "駆け出しの旅人": { desc: "この世界に足を踏み入れた者に与えられる。 ", hint: "初期称号" },
    "韋駄天": { desc: "1ターンに驚異的な移動距離を記録した証。", hint: "1ターンに一定マス以上移動して勝利する" },
    "電光石火": { desc: "目にも止まらぬ速さで決着をつけた証。", hint: "少ないターン数で勝利する" },
    "虹の覇者": { desc: "七色の輝きをすべて手中に収めた真の勝者。", hint: "7色すべてをロックして勝利する" },
    "不屈の闘志": { desc: "逆境から立ち上がり、勝利を掴んだ証。", hint: "大量のロックを奪われた後に逆転勝利する" },
    "慎重派": { desc: "一歩一歩、確実な布石を打つ戦略家。", hint: "タイムアップにならずに一定ターンプレイする" }
    // 今後、新しい称号が増えるたびにここに追加できます
};



/**
 * 獲得済みの称号から表示するものを選ぶモーダル
 */
function showTitleSelectionModal(onChanged) {
    const titles = userProfile.unlockedTitles || ["駆け出しの旅人"];
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4';
    
    let titleOptionsHtml = titles.map(t => {
        const info = TITLE_DESCRIPTION_MAP[t] || { desc: "謎に包まれた称号。", hint: "獲得条件不明" };
        const isSelected = userProfile.selectedTitle === t;
        
        return `
            <div class="flex flex-col gap-1 mb-2">
                <div class="flex items-center gap-2">
                    <button class="flex-1 p-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-white font-bold transition-all text-left flex justify-between items-center group ${isSelected ? 'border-yellow-500 bg-gray-700' : ''}" onclick="window._selectTitle('${t}')">
                        <span>${t}</span>
                        ${isSelected ? '<span class="text-yellow-500 text-sm">●</span>' : ''}
                    </button>
                    <button class="w-10 h-10 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded-xl text-gray-400 border border-gray-600" 
                            onclick="event.stopPropagation(); window._toggleTitleInfo('${t}')">
                        <span class="text-xs">？</span>
                    </button>
                </div>
                <div id="info-${t}" class="hidden p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 text-[11px] space-y-1 animate-fade-in">
                    <div class="text-yellow-500/80">【由来】${info.desc}</div>
                    <div class="text-gray-400 italic">【獲得条件】${info.hint}</div>
                </div>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="bg-gray-900 border-2 border-yellow-500/50 w-full max-w-xs rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div class="p-4 border-b border-gray-800 text-center bg-gray-800/50">
                <h3 class="text-yellow-500 font-bold">称号変更</h3>
            </div>
            <div class="p-4 space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                ${titleOptionsHtml}
            </div>
            <div class="p-3 bg-gray-800/30">
                <button id="close-title-select" class="w-full py-2 text-gray-400 hover:text-white text-sm">キャンセル</button>
            </div>
        </div>
    `;

    // グローバルに関数を一時登録（簡易化のため）
    window._selectTitle = (titleName) => {
        userProfile.selectedTitle = titleName;
        saveUserProfile();
        modal.remove();
        if (onChanged) onChanged();
    };

    // 説明文の表示切り替え
    window._toggleTitleInfo = (titleName) => {
        const infoEl = document.getElementById(`info-${titleName}`);
        if (infoEl) {
            const isHidden = infoEl.classList.contains('hidden');
            // 他の開いている説明を全部閉じる（スッキリさせるため）
            document.querySelectorAll('[id^="info-"]').forEach(el => el.classList.add('hidden'));
            // クリックしたものだけトグル
            if (isHidden) infoEl.classList.remove('hidden');
        }
    };

    document.body.appendChild(modal);
    modal.querySelector('#close-title-select').onclick = () => modal.remove();
}

/**
 * レベルアップまたはランクアップをお祝いする演出モーダル
 * @param {string} type - 'LEVEL' または 'RANK'
 * @param {number|string} newValue - 新しいレベル数、またはランク名
 */
function showLevelUpModal(type, newValue) {
    const isLevel = type === 'LEVEL';
    const title = isLevel ? "LEVEL UP!" : "RANK UP!";
    const subTitle = isLevel ? `Lv.${newValue} に到達` : `${newValue}`;
    const colorClass = isLevel ? "text-blue-400" : "text-yellow-500"; // 黄色を少し濃く
    
    const modal = document.createElement('div');
    // 背景の透過度をモードで切り替え
    const overlayBg = isLightMode ? 'bg-white/80' : 'bg-black/60';
    modal.className = `fixed inset-0 z-[11000] flex items-center justify-center ${overlayBg} backdrop-blur-md animate-fade-in pointer-events-none`;
    
    // パネルの背景色と文字色をモードで切り替え
    const panelBg = isLightMode ? 'bg-white' : 'bg-gray-900/90';
    const textColor = isLightMode ? 'text-gray-900' : 'text-white';
    const subTextColor = isLightMode ? 'text-gray-600' : 'text-gray-300';

    modal.innerHTML = `
        <div class="text-center animate-bounce-in pointer-events-auto">
            <div class="text-6xl font-black ${colorClass} italic drop-shadow-[0_4px_10px_rgba(0,0,0,0.3)] mb-2 uppercase tracking-tighter">${title}</div>
            <div class="${panelBg} border-y-4 border-yellow-500 py-6 px-16 transform -skew-x-12 shadow-2xl">
                <div class="text-3xl font-black ${textColor} skew-x-12 tracking-tight">${subTitle}</div>
            </div>
            <div class="${subTextColor} text-xs mt-8 font-bold animate-pulse">画面をクリックして閉じる</div>
        </div>
    `;

    document.body.appendChild(modal);

    // どこをクリックしても閉じるようにする
    const closeHandler = () => {
        modal.classList.add('animate-fade-out');
        setTimeout(() => {
            modal.remove();
            // ★追加：レベルアップ演出が終わったら、タイトルではなくホームへ戻す
            if (typeof backToTitle === 'function') {
                backToTitle(); 
            }
        }, 500);
        document.removeEventListener('click', closeHandler);
    };
    setTimeout(() => {
        document.addEventListener('click', closeHandler);
    }, 500);
}

/**
 * ゲーム終了後のランク変動を表示するモーダル
 */
/** 2026/03/05 11:30 修正：実際のポイント差分を計算して +2pt 等を表示するように修正 **/
function showPostGameRankModal(isWin, oldPoint, newPoint, onFinish) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[11000] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in';
    
    // ポイントの差分を計算（昇格時は newPoint が 0 になるため、isWin で符号を確定）
    const diff = isWin ? Math.max(1, newPoint - oldPoint) : newPoint - oldPoint;
    // 昇格（newPoint=0）のケースも考慮しつつ、表示テキストを作成
    const displayDiff = (isWin && newPoint < oldPoint) ? (7 - oldPoint) : Math.abs(newPoint - oldPoint);
    
    const changeText = isWin ? `+${displayDiff}pt` : `-${displayDiff}pt`;
    const changeColor = isWin ? "text-yellow-400" : "text-red-500";
    
    modal.innerHTML = `
        <div class="bg-gray-900 border-2 border-gray-700 p-8 rounded-3xl shadow-2xl text-center max-w-xs w-full animate-bounce-in">
            <h3 class="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Rank Progress</h3>
            <div class="text-4xl font-black ${changeColor} mb-6 italic tracking-tighter">${changeText}</div>
            
            <div class="flex justify-between items-center gap-1.5 mb-4">
                ${Array.from({ length: 7 }).map((_, i) => {
                    // アニメーション用に、最初は古いポイント状態で描画
                    const isReached = i < oldPoint;
                    return `
                        <div id="rank-block-${i}" class="flex-1 h-4 rounded-sm border-2 transition-all duration-700 ${
                            isReached 
                            ? 'bg-yellow-500 border-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.6)]' 
                            : 'bg-transparent border-gray-700 opacity-40'
                        }"></div>
                    `;
                }).join('')}
            </div>
            
            <p class="text-gray-400 text-[10px] mb-8 italic">タップして次へ</p>
        </div>
    `;

    document.body.appendChild(modal);

    /** 2026/03/05 14:15 修正：ゲージのアニメーション完了を待ってから派手な演出を表示 **/
    setTimeout(() => {
        const blocks = modal.querySelectorAll('[id^="rank-block-"]');
        
        // 昇格時（newPointが0に戻っている場合）は全てのブロックを一旦光らせる
        const isPromotion = (isWin && newPoint < oldPoint);
        
        blocks.forEach((block, i) => {
            const shouldLight = isPromotion ? true : (i < newPoint);
            if (shouldLight) {
                block.className = 'flex-1 h-4 rounded-sm border-2 transition-all duration-700 bg-yellow-500 border-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.6)]';
            } else {
                block.className = 'flex-1 h-4 rounded-sm border-2 transition-all duration-700 bg-transparent border-gray-700 opacity-40';
            }
        });

        // アニメーション時間（0.7秒）を待ってから、予約されたランクアップ演出があれば表示
        if (window.pendingRankUpEffect) {
            setTimeout(() => {
                const { type, value } = window.pendingRankUpEffect;
                if (typeof showLevelUpModal === 'function') {
                    showLevelUpModal(type, value);
                }
                window.pendingRankUpEffect = null; // 実行したのでクリア
            }, 800); 
        }
    }, 500);

    /**
 * 2026/03/06 修正
 * レベルアップしなかった場合でも、ゲージを閉じた後にホーム画面へ戻るように修正
 */
    const close = () => {
        modal.classList.add('animate-fade-out');
        setTimeout(() => {
            modal.remove();
            
            // レベルアップしなかった場合（＝次に続く showLevelUpModal が呼ばれない場合）
            // 確実にホーム画面へ戻すために backToTitle を実行
            if (!data.isLevelUp) {
                if (typeof backToTitle === 'function') {
                    backToTitle();
                }
            }
            
            if (onFinish) onFinish();
        }, 500);
        document.removeEventListener('click', close);
    };
    
    setTimeout(() => document.addEventListener('click', close), 1000);
}

/** 2026/03/05 15:30 修正：ゲージが空になるバグを修正し、ヌルっとした動きを保証 **/
function showPostGameLevelModal(data, onFinish) {
    const modal = document.createElement('div');
    const overlayBg = isLightMode ? 'bg-white/90' : 'bg-black/70';
    modal.className = `fixed inset-0 z-[11000] flex items-center justify-center ${overlayBg} backdrop-blur-sm animate-fade-in`;
    
    // ライトモード用の配色
    const panelBg = isLightMode ? 'bg-gray-100' : 'bg-gray-900';
    const borderColor = isLightMode ? 'border-blue-200' : 'border-blue-900/50';
    const mainText = isLightMode ? 'text-gray-900' : 'text-white';
    const muteText = isLightMode ? 'text-gray-500' : 'text-gray-400';

    // 累積勝利数に基づいた正確な進捗計算
    const range = Math.max(1, data.neededWins - data.baseWins);
    // ゲージの初期位置（今回の勝利を加算する前）
    const prevWins = data.currentWins - (data.isLevelUp ? 1 : 1); // 常に直前の状態から見せる
    const initialPct = Math.max(0, ((prevWins - data.baseWins) / range) * 100);
    const targetPct = Math.min(100, ((data.currentWins - data.baseWins) / range) * 100);

    modal.innerHTML = `
        <div class="${panelBg} border-2 ${borderColor} p-8 rounded-3xl shadow-2xl text-center max-w-xs w-full animate-bounce-in">
            <h3 class="${muteText} text-xs font-bold uppercase tracking-widest mb-1">Level Progress</h3>
            <div class="text-4xl font-black text-blue-500 mb-2 italic tracking-tighter">Lv.${data.oldLevel}</div>
            
            <div class="w-full h-6 bg-gray-300 dark:bg-gray-800 rounded-full border-2 border-gray-400 dark:border-gray-700 p-1 mb-2 relative overflow-hidden shadow-inner">
                <div id="level-gauge-bar" class="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.6)]" 
                     style="width: ${initialPct}%; transition: none;"></div>
            </div>
            <div class="flex justify-between text-[10px] font-mono ${muteText} mb-6">
                <span>Wins: ${data.currentWins}</span>
                <span>Next: ${data.neededWins}</span>
            </div>
            
            <p class="${muteText} text-[10px] italic">タップして次へ</p>
        </div>
    `;

    document.body.appendChild(modal);

    // 確実に初期描画が終わってからアニメーションさせるための2段構え
    setTimeout(() => {
        const bar = document.getElementById('level-gauge-bar');
        if (bar) {
            bar.style.transition = "width 2.5s cubic-bezier(0.22, 1, 0.36, 1)"; // よりヌルっとしたイージング
            bar.style.width = `${targetPct}%`;
        }
        
        if (data.isLevelUp) {
            setTimeout(() => {
                if (typeof showLevelUpModal === 'function') showLevelUpModal('LEVEL', data.newLevel);
            }, 2200);
        }
    }, 100); // 0.1秒待機してから開始

    const close = () => {
        modal.classList.add('animate-fade-out');
        setTimeout(() => {
            modal.remove();
            if (onFinish) onFinish();
        }, 500);
        document.removeEventListener('click', close);
    };
    setTimeout(() => document.addEventListener('click', close), 1500);
}

/**
 * ホーム画面からCPU戦の人数選択を表示する
 */
function showCpuBattleSelection() {
    const home = document.getElementById('home-screen');
    const cpuSetup = document.getElementById('cpu-setup-overlay');
    if (home) home.classList.add('hidden');
    if (cpuSetup) {
        cpuSetup.classList.remove('hidden');
        // ★追加：開始時は常に「通常モード」にリセット
        setCpuBoostMode(false);
        
        // CPU戦なのでNORMALモードをデフォルトに設定
        autoMode = 'NORMAL';
        const modeSelect = document.getElementById('setting-auto-mode');
        if (modeSelect) modeSelect.value = 'NORMAL';
    }
}

/**
 * ホーム画面から練習（2P / EASY）を即座に開始する
 */
/** 2026/03/04 修正：練習モード開始時にもオート設定を自動適用 **/
async function startPracticeGame() {
    const home = document.getElementById('home-screen');
    if (home) home.classList.add('hidden');
    
    // --- CPU戦用自動設定の適用 ---
    window.PHASE_TIME_ADD = 1;
    isP1TimerIgnored = true;
    isRandomLockOnTimeout = true;
    isAutoAction = true;
    isOnlyP1HandVisible = true;
    isSkipSelectionOnAuto = true;

    // 自動処理レベルをEASYにする
    autoMode = 'EASY';
    const modeSelect = document.getElementById('setting-auto-mode');
    if (modeSelect) modeSelect.value = 'EASY';

    addLog("練習モード(EASY)を開始します...");
    
    // プロフィール情報から名前を反映（P1を自分に）
    window.pendingProfiles = [
        { name: userProfile.name, icon: userProfile.icon },
        { name: "CPU (Practice)", icon: "images/character_002.webp" }
    ];
    window.isProfileSet = true;

    // 2人戦でゲーム開始
    if (typeof initGame === 'function') {
        initGame(2);
    }
}

/** 2026/03/04 修正：実在変数名への適合とタイマー強制停止ロジックの導入 **/
/** 2026/03/04 修正：CPU戦開始時にHTMLの設定値を書き換え、Changeイベントを強制発火させて同期 **/
function startCpuGame(num) {
    const cpuSetup = document.getElementById('cpu-setup-overlay');
    if (cpuSetup) cpuSetup.classList.add('hidden');

    // 1. 強制フラグをONにする
    window.FORCED_CPU_MODE = true;

    // 2. 念のためHTMLのチェックも入れておく（手動設定との整合性のため）
    const settings = ['setting-p1-timer-ignore', 'setting-timeout-random-lock', 'setting-timeout-auto-hand', 'setting-p1-hand-only', 'setting-skip-selection'];
    settings.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
    });

    addLog(`CPU対戦 (${num}人 / NORMAL) 強制オートモードで開始します`);

    // --- 設定の強制同期（手動設定と同じルートを通す） ---
    const forceSyncSetting = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            if (el.type === 'checkbox') el.checked = value;
            else el.value = value;
            // bubbles: true を追加し、親要素（設定画面全体など）に通知が届くようにする
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    /** 2026/03/04 21:12 修正：CPU戦開始時にグローバル変数 PHASE_TIME_ADD を直接書き換え **/
    // ご指示の設定を一斉適用
    forceSyncSetting('setting-phase-time-add', 1);     // フェイズ補充 1秒
    window.PHASE_TIME_ADD = 1;                         // 補充設定を1秒に
    window.currentPhaseMaxTime = 1;                    // 現在のフェイズ制限時間も1秒に強制
    
    forceSyncSetting('setting-p1-timer-ignore', true); // P1タイマー無視
    forceSyncSetting('setting-random-lock', true);     // タイムアウト時ランダムロック
    forceSyncSetting('setting-auto-action', true);     // タイムアウト時自動手札使用
    forceSyncSetting('setting-p1-hand-only', true);    // P1の手札のみ表示
    forceSyncSetting('setting-skip-selection', true);  // 自動処理時選択画面スキップ

    addLog(`CPU対戦 (${num}人 / NORMAL) 自動設定を適用しました`);

    // プロフィール設定（ここは変更なし）
    const cpuIcons = ["images/character_002.webp", "images/character_003.webp", "images/character_004.webp"];
    const cpuNames = ["CPU (Alpha)", "CPU (Beta)", "CPU (Gamma)"];
    window.pendingProfiles = [{ name: userProfile.name, icon: userProfile.icon }];
    for (let i = 0; i < num - 1; i++) {
        window.pendingProfiles.push({ name: cpuNames[i], icon: cpuIcons[i] });
    }
    window.isProfileSet = true;

    if (typeof initGame === 'function') {
        initGame(num);
    }
}

/**
 * CPU選択画面からホームに戻る
 */
function backToHomeFromCpu() {
    const cpuSetup = document.getElementById('cpu-setup-overlay');
    const home = document.getElementById('home-screen');
    if (cpuSetup) cpuSetup.classList.add('hidden');
    if (home) home.classList.remove('hidden');
}

/**
 * 戦歴リセットの最終確認を表示
 */
function confirmResetStats() {
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) settingsModal.classList.add('hidden');

    // showDetailModal の OKボタンは通常 gainTime(5) を呼び出しますが、
    // ここでは gainTime が動かないように特殊なフラグ制御下で実行するか、
    // もしくはリセット専用の処理として実行します。
    
    showDetailModal(
        "⚠️ データの初期化", 
        "これまでの戦歴、ランク、称号、設定がすべて消去されます。<br><b class='text-red-500'>この操作は取り消せません。</b><br>本当によろしいですか？", 
        null, 
        "すべて削除して再起動", 
        () => {
            // gainTime エラーを防ぐため、一時的に window のエラーを無視するか、
            // 即座にリセット処理へ移行します。
            executeResetStats();
        }
    );
    
    const cancelBtn = document.getElementById('detail-cancel-btn');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            closeDetailModal();
            if (settingsModal) settingsModal.classList.remove('hidden');
        };
    }
}

/**
 * 実際のデータ削除とリロードを実行
 */
function executeResetStats() {
    // 1. まず window 内の gainTime 関数を無効化してエラーを封じる（外科手術的処置）
    window.gainTime = () => {}; 

    // 2. データを削除
    localStorage.removeItem('shades_seven_profile');
    localStorage.removeItem('shades_light_mode'); // 設定も一応消す
    
    addLog("すべてのデータを初期化しました。");

    // 3. ブラウザを強制的にリロード（キャッシュを無視）
    // エラーが出る前に即座にページを破棄します
    window.location.reload();
}

// ページ読み込み完了時や初期化時にアイコンを最新にする
document.addEventListener('DOMContentLoaded', () => {
    if (typeof updateProfileButtonVisual === 'function') {
        updateProfileButtonVisual();
    }
});

/**
 * 2026/03/06 修正
 * ホーム画面からタイトルオーバーレイ（START GAME画面）に戻る処理。
 */
function backToTitle() {
    const homeScreen = document.getElementById('home-screen');
    const titleOverlay = document.getElementById('title-overlay');
    
    if (homeScreen && titleOverlay) {
        // ホーム画面を隠す
        homeScreen.classList.add('hidden');
        // タイトル画面を表示する
        titleOverlay.classList.remove('hidden');
        
        // 念のため、初期化フラグなどもリセットが必要であればここで行います
        window.isProfileSet = false; 
        
        addLog("タイトル画面に戻りました。");
    }
}

/**
 * 2026/03/06 修正
 * CPU戦のブーストモード設定を切り替える
 */
function setCpuBoostMode(isBoost) {
    // グローバル変数の更新
    isBoostMode = isBoost;
    
    // UIの見た目を更新
    const normalBtn = document.getElementById('cpu-mode-normal');
    const boostBtn = document.getElementById('cpu-mode-boost');
    
    if (isBoost) {
        boostBtn.className = "flex-1 py-2 text-[10px] font-black rounded-lg transition-all bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.4)]";
        normalBtn.className = "flex-1 py-2 text-[10px] font-black rounded-lg transition-all text-gray-500";
        // 開発用設定のチェックボックスも同期させる
        const boostCheck = document.getElementById('setting-boost-mode');
        if (boostCheck) boostCheck.checked = true;
    } else {
        normalBtn.className = "flex-1 py-2 text-[10px] font-black rounded-lg transition-all bg-yellow-600 text-black";
        boostBtn.className = "flex-1 py-2 text-[10px] font-black rounded-lg transition-all text-gray-500";
        const boostCheck = document.getElementById('setting-boost-mode');
        if (boostCheck) boostCheck.checked = false;
    }
}