/**
 * 7 SHADES OF S:EVEN - Core Logic
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


function showPlayerSelection() {
    const titleEl = document.getElementById('title-overlay');
    const setupEl = document.getElementById('setup-overlay');
    if (titleEl) titleEl.classList.add('hidden');
    if (setupEl) setupEl.classList.remove('hidden');
}


/**
 * セットアップ画面（プレイ人数選択）の表示
 */
function showSetup() {
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
            if (typeof gainTime === 'function') gainTime(5); 
            if (selected.includes(item)) { 
                selected = selected.filter(c => c !== item); 
                el.classList.remove('selected-card-glow'); 
            } else { 
                if (selected.length < count) { 
                    selected.push(item); 
                    el.classList.add('selected-card-glow'); 
                } 
            } 
            if (selected.length === count) setTimeout(() => showSelectionResult(selected, onComplete, title, cancelCallback, autoBtnText, isBlind, actingPlayer), 300); 
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
            if (typeof gainTime === 'function') gainTime(5); 
            document.getElementById('selection-modal').classList.add('hidden'); 
            managePeekUI(false); 
            onComplete(cards); 
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
          subEl = document.getElementById('arrival-subtitle');
    
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
        let txtCls = card.colorId === 'white' ? 'text-gray-800' : (card.colorId === 'black' ? 'text-gray-200' : 'text-white');
        const cardEl = document.createElement('div'); 
        // クラスは modal-large-card を維持（CSS側で2枚以上の時の縮小を制御）
        cardEl.className = "modal-large-card perspective-1000 shrink-0 relative mb-4";
        
        const imgPath = card.image || (card.id ? `images/card_${card.id}.webp` : null);
        
        cardEl.innerHTML = `
            <div class="flip-card-inner relative w-full h-full">
                <div class="flip-card-back ${card.type === 'ETERNAL' ? 'eternal-back-pattern' : 'card-back-pattern'} border-2 rounded-lg flex items-center justify-center w-full h-full"></div>
                <div class="flip-card-front border-2 border-white rounded-lg w-full h-full flex flex-col items-center justify-center absolute inset-0 overflow-hidden ${card.bg}" ${imgPath ? `style="background-image: url('${imgPath}'); background-size: cover; background-position: center;"` : ""}>
                    <span class="${imgPath ? 'hidden' : ''} font-bold text-4xl ${txtCls} z-10">${card.name ? card.name[0] : '?'}</span>
                </div>
            </div>`;
        cardsContainer.appendChild(cardEl); 
        // 【修正】前面(frontEl)ではなくカード全体(cardEl)にイベントを付与
        if (typeof attachHoverEvents === 'function') {
            attachHoverEvents(cardEl, card, true);
        }

        // 【重要】ガードレイヤー越しでもクリックでめくれるようにイベントを修正
        const inner = cardEl.querySelector('.flip-card-inner');
        
        // めくる処理を関数化
        const flipFunc = () => {
            if (inner && !inner.classList.contains('do-flip')) {
                inner.classList.add('do-flip');
            }
        };

        // カード全体に対するクリックでめくる
        cardEl.addEventListener('click', flipFunc);

        // ★修正：判定を「ドロー」という文字が含まれている場合のみに限定します
        const isPureDraw = titleText.includes("ドロー");
        
        if (isPureDraw) {
            // 「ドロー」モーダルの場合のみ：裏面からスタートして、0.4秒後にゆっくり回転
            setTimeout(flipFunc, 400); 
        } else {
            // それ以外（到達獲得、到達効果発動など）の場合：即座に表面を表示（回転なし）
            if (inner) {
                inner.style.transition = "none"; 
                inner.classList.add('do-flip');
            }
        }
    });

    const msgEl = document.getElementById('arrival-msg'), btnEl = document.getElementById('arrival-ok-btn');

    if (actualCards.length > 0) {
        msgEl.textContent = actualCards.length > 1 ? `「${actualCards[0].name}」ほか` : `「${actualCards[0].name}」`;
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

    const shuffled = allValidCells.sort(() => Math.random() - 0.5);
    const selection = shuffled.slice(0, selectionState.count);
    
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
                        acquiredCards.push(target.color);
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

                // 1. 移動元点滅
                await animateCellBlink(victim.x, victim.y, '#f97316');

                // 2. 移動（演出用クラスを付与）
                await moveToCell(victim, destPos.x, destPos.y, false, null, null, 'moving-unit-glow');

                // 3. 移動先点滅
                await animateCellBlink(destPos.x, destPos.y, '#f97316');
                
                addLog(`${p.name}がフォースの力で${victim.name}を移動させました。`);
                
                const cell = board[destPos.y][destPos.x];
                const card = cell.empty ? null : cell.color;
                
                if (card) {
    // 演出としてオープンと波紋だけを行い、ロジック自体は moveToCell 側の自動到達判定に任せる
    cell.revealed = true;
    if (typeof renderBoard === 'function') renderBoard();

    if (typeof triggerArrivalRipple === 'function') {
        triggerArrivalRipple(destPos.x, destPos.y, card.hex);
    }

    // handleArrivalLogic を直接呼ばず、少し待機してからコールバック（選択モード終了）のみ実行
    setTimeout(() => {
        if (callback) callback(selection);
    }, 700);

                } else {
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
    modal.className = "fixed inset-0 z-[1000] bg-black/95 flex flex-col items-center justify-center p-2";
    
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
                <span class="text-[10px] font-bold text-white truncate w-full text-center">${thief.name}</span>
            </div>

            <div class="flex flex-col items-center shrink-0 w-12">
                <div class="text-2xl text-yellow-500">◀</div>
                <div class="steal-card-blinking"></div>
            </div>

            <div class="steal-player-unit">
                <img src="${victim.icon}" class="steal-prof-img" style="border-color: ${victim.color.hex}">
                <span class="text-[10px] font-bold text-white truncate w-full text-center">${victim.name}</span>
                <div class="flex items-center justify-center mt-2 px-1 w-full overflow-visible">
                    ${handHTML}
                </div>
            </div>
        </div>
        <p class="text-gray-300 text-[12px] mt-10 px-6 text-center leading-tight">
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

    const overlay = document.createElement('div');
    overlay.className = "absolute inset-0 z-[5000] flex items-center justify-center bg-black/80";

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

    overlay.innerHTML = `
        <div class="bg-gray-900 border-2 border-yellow-600 w-[90%] h-[85%] flex flex-col rounded-lg overflow-hidden shadow-2xl">
            <div class="p-2 border-b border-gray-700 flex justify-between items-center bg-gray-800 shrink-0">
                <span class="text-yellow-500 font-bold text-[10px]">全山札構成 (計112枚)</span>
                <button onclick="this.closest('.absolute').remove()" class="bg-red-600 text-white px-3 py-1 rounded text-[10px] font-bold">閉じる</button>
            </div>
            <div class="flex-grow overflow-y-auto p-2 bg-gray-950">
                ${sectionsHTML}
            </div>
        </div>
    `;

    if (appContainer) {
        appContainer.appendChild(overlay);
    } else {
        document.body.appendChild(overlay);
    }
};

// --- 演出用：プレゼントモーダル ---
function showPresentFlowerModal(giver, receiver, card, onComplete) {
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 z-[1000] bg-black/95 flex flex-col items-center justify-center p-2";
    
    modal.innerHTML = `
        <h2 class="text-xl font-black text-pink-400 mb-8 italic tracking-tighter animate-pulse">FLOWER PRESENT!!</h2>
        <div class="steal-display-container" style="width: 100%; max-width: 350px;">
            <div class="steal-player-unit">
                <img src="${giver.icon}" class="steal-prof-img" style="border-color: ${giver.color.hex}">
                <span class="text-[10px] font-bold text-white truncate w-full text-center">${giver.name}</span>
            </div>

            <div class="flex flex-col items-center shrink-0 w-12">
                <div class="text-2xl text-pink-400">▶</div>
                <img src="${card.image}" class="w-10 h-10 object-contain animate-bounce" style="filter: drop-shadow(0 0 8px #f472b6);">
            </div>

            <div class="steal-player-unit">
                <img src="${receiver.icon}" class="steal-prof-img" style="border-color: ${receiver.color.hex}">
                <span class="text-[10px] font-bold text-white truncate w-full text-center">${receiver.name}</span>
            </div>
        </div>
        <p class="text-gray-300 text-[12px] mt-10 px-6 text-center leading-tight">
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

    // 0. 暗転レイヤー
    const overlay = document.createElement('div');
    overlay.className = 'final-v-overlay';
    appEl.appendChild(overlay);

    // 1. 振動（エラー防止のため存在チェック）
    if (typeof triggerHeartbeatHaptic === 'function') triggerHeartbeatHaptic();

    // 2. 代表して赤のスロットをターゲットに
    const slotEl = document.getElementById(`p${winnerId}-slot-red`);
    let rotate = 0;
    if (winnerId === 2) rotate = 180;
    else if (winnerId === 3) rotate = 90;
    else if (winnerId === 4) rotate = 270;

    if (slotEl) {
        const rect = slotEl.getBoundingClientRect();
        const appRect = appEl.getBoundingClientRect();
        const slotCenterX = rect.left - appRect.left + rect.width / 2;
        const slotCenterY = rect.top - appRect.top + rect.height / 2;
        const moveX = (appRect.width / 2) - slotCenterX;
        const moveY = (appRect.height / 2) - slotCenterY;

        requestAnimationFrame(() => {
            appEl.classList.add('final-v-zoom-active');
            overlay.classList.add('active');
            appEl.style.transformOrigin = `${slotCenterX}px ${slotCenterY}px`;
            // PCでの見切れ防止のため倍率を 1.5倍 に設定
            appEl.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.5) rotate(${rotate}deg)`;
            
            BASE_COLORS.forEach(col => {
                const s = document.getElementById(`p${winnerId}-slot-${col.id}`);
                if (s) s.classList.add('victory-slot-highlight');
            });
        });
    }

    // 3. 衝撃波とバナー（2.5秒後）
    setTimeout(() => {
        const nova = document.createElement('div');
        nova.className = 'rainbow-nova';
        nova.style.top = '50%';
        nova.style.left = '50%';
        document.body.appendChild(nova);
        
        requestAnimationFrame(() => nova.classList.add('nova-animate'));

        const winner = players.find(pl => pl.id === winnerId);
        const banner = document.createElement('div');
        banner.className = 'victory-banner';
        
        // 【修正】いかなるプレイヤーが勝利しても、バナー自体は回転させず常に正面(0deg)を向かせる
        const finalTransform = `translate(-50%, -50%) scale(1.2) rotate(0deg)`;
        banner.style.transform = finalTransform;
        
        banner.innerHTML = `
            <div class="text-5xl font-black italic text-yellow-400 drop-shadow-[0_4px_10px_rgba(0,0,0,1)] mb-4">WINNER!!</div>
            <div class="flex flex-col items-center">
                <img src="${winner.icon}" class="w-32 h-32 rounded-full border-4 border-yellow-400 shadow-2xl mb-4 bg-gray-900">
                <div class="text-3xl font-bold text-white drop-shadow-lg">${winner.name}</div>
            </div>
        `;
        document.body.appendChild(banner);
        
        setTimeout(() => {
            banner.style.opacity = "1";
            // ここも 0deg で固定
            banner.style.transform = `translate(-50%, -50%) scale(1.2) rotate(0deg)`;
        }, 50);

        setTimeout(() => {
            if (nova) nova.remove();
            if (banner) banner.remove(); 
            
            // ★重要：盤面全体（#app）の回転・拡大・マージンを完全に消去して標準状態に戻す
            appEl.style.transform = "none";
            appEl.style.transformOrigin = "center";
            appEl.classList.remove('final-v-zoom-active');
            const ov = document.querySelector('.final-v-overlay');
            if (ov) ov.remove();

            // 演出が完全に終わってから、次の処理（リザルト表示）へ
            if (onComplete) onComplete();
        }, 3000); // 演出をしっかり見せるため3秒確保
    }, 2500);
}