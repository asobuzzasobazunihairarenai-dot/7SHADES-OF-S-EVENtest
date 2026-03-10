/**
 * 7 SHADES OF S:EVEN - game_effects.js
 * 【共通定義】
 * - 到達: 表向きカードの上に駒が置かれた瞬間
 * - 到達効果: 到達時に発動。原則「効果解決」→「カード獲得」の順。
 * - 例外: カードに処遇（場に残る、破棄等）が書かれている場合はそれに従う。
 */
/**
 * 2026/02/07 10:20 修正
 * 1. 処理順の原則に基づき、発動者が対象に含まれる場合は「発動者(P3) -> P4 -> P1 -> P2」の順で処理されることを確認・維持。
 * 2. rich_whim_logic、frog_arrival、frog_hand において発動者から開始するシーケンスを保証。
 */

/**
 * 手札効果が現在使用可能かどうかを判定する
 */
function canPlayHandEffect(card, p) {
    // 【修正】カードが存在しない、または現在処理中の場合は使用不可
    if (!card || !card.handEffect || card.isProcessing) return false;

    // 【追加】封印状態（このターン使えない効果等）のカードは使用不可
    if (card.sealed) return false;

    // 「1ターンに1度」制限があるカードID（11:ヴァーディアンなど）の判定
    const oncePerTurnIDs = [11]; 

    // ★追加：NORMALモード時の温存ロジック
    // ★修正：NORMALモード時の温存ロジック（判定条件を強化）
    // ★修正：真に「システムによる自動実行中」のみを対象とする
    const isEffectivelyAuto = isAutoAction || isAutoProcessing;

    if (typeof autoMode !== 'undefined' && autoMode === 'NORMAL' && isEffectivelyAuto) {
        const col = card.colorId;
        // 7色の通常色（赤・橙・黄・緑・青・桃・紫）が対象
        const isBasicColor = ['red', 'orange', 'yellow', 'green', 'blue', 'pink', 'purple'].includes(col);
        
        if (isBasicColor) {
            const slot = collections[p.id][col];
            // まだその色がロックされていない（スロットが空、または呪いのみ）場合は温存する
            const isNotLocked = !slot || slot.length === 0 || (slot.length === 1 && slot[0].id === 34);
            if (isNotLocked) {
                return false; // ロック用に取っておくため、自動では絶対に使わない
            }
        }
    }


    if (oncePerTurnIDs.includes(card.id)) {
        if (usedOnceEffectsThisTurn.includes(card.id)) return false;
    }

    // ID 15: ダッシュ - 移動できるマスがない場合はグレーアウト
    if (card.id === 15) {
        // checkStuck(p) が true = どこにも動けない状態
        if (typeof checkStuck === 'function' && checkStuck(p)) return false;
    }

    // 2026/03/11 修正：ちょっと待った！の手札効果を使用可能に変更
    if (card.id === 21) {
        // 相手がロックフェイズ中の時のみ使用可能
        const p = players[turn];
        return (currentPhase === PHASE.LOCK && p.id !== 1); 
    } 

    // ID 22: 反撃
    if (card.id === 22) return false;

    // ★ 2026/03/07 追加：神鳴(ID:24)の特別ルール
    if (card.id === 24) {
        // 盤面に1枚でも !empty なマスがあるかチェック
        const hasAnyCard = board.some(row => row.some(cell => !cell.empty));
        if (!hasAnyCard) return false; // 盤面が空ならグレーアウト対象
    }

    // ★ 2026/03/08 追加：なないろの欠片(ID:29) の温存ロジック
    if (card.id === 29) {
        if (typeof autoMode !== 'undefined' && autoMode === 'NORMAL' && isAutoAction) {
            const pHand = hands[p.id] || [];
            const otherFragsCount = pHand.filter(c => Number(c.id) === 29 && c !== card).length;
            const canDouble = otherFragsCount >= 1; 

            // 2枚持っていない（2枚ロックができない）場合
            if (!canDouble) {
                // 10%の確率(0.1)を引かなかった場合は「使用不可」と判定して温存させる
                if (Math.random() > 0.1) {
                    return false; 
                }
            }
        }
    }

    // ID 30: カラフルホール の有効化条件
    if (card.id === 30) {
        // 全プレイヤーのロック数を算出
        const lockCounts = players.map(pl => {
            let count = 0;
            LOCK_ORDER.forEach(col => {
                const slot = collections[pl.id][col.id];
                if (slot && slot.length > 0) count += slot.length;
            });
            return count;
        });
        const maxL = Math.max(...lockCounts);

        // 最多ロック者のうち、奪えるカード（Normalかつ白黒以外）を1枚でも持っているプレイヤーがいるか
        const hasValidTarget = players.some((pl, idx) => {
            if (lockCounts[idx] !== maxL) return false;
            return LOCK_ORDER.some(col => {
                const slot = collections[pl.id][col.id];
                if (slot && slot.length > 0) {
                    const topC = slot[slot.length - 1];
                    // エターナル、ファースト、ブースト、および白・黒（呪い等）は対象外
                    return topC.type !== 'ETERNAL' && topC.type !== 'FIRST' && topC.type !== 'BOOST' && topC.colorId !== 'white' && topC.colorId !== 'black';
                }
                return false;
            });
        });
        if (!hasValidTarget) return false;
    }

    // ID 32: いろ落ちガエル の有効化条件
    if (card.id === 32) {
        const hasValidTarget = players.some(opp => {
            return LOCK_ORDER.some(col => {
                const slot = collections[opp.id][col.id];
                if (slot && slot.length > 0) {
                    const topCard = slot[slot.length - 1];
                    // エターナル、ファースト、ブースト、および白・黒は対象外
                    return topCard.type !== 'ETERNAL' && topCard.type !== 'FIRST' && topCard.type !== 'BOOST' && topCard.colorId !== 'white' && topCard.colorId !== 'black';
                }
                return false;
            });
        });
        if (!hasValidTarget) return false;
    }

    // ID 33: 強欲なパレット
    if (card.id === 33) {
        const lockCounts = players.map(pl => {
            let count = 0;
            LOCK_ORDER.forEach(col => {
                const slot = collections[pl.id][col.id];
                if (slot && slot.length > 0) count += slot.length;
            });
            return count;
        });
        const maxL = Math.max(...lockCounts);
        // 最多ロック者のうち、手札が1枚以上あるプレイヤーが1人でもいれば使用可能
        const candidates = players.filter((pl, idx) => lockCounts[idx] === maxL);
        const anyoneHasHand = candidates.some(pl => (hands[pl.id] || []).length > 0);
        if (!anyoneHasHand) return false;
    }

    // ID 34: にじいろの呪い
    if (card.id === 34) {
        const lockCounts = players.map(pl => ({
            id: pl.id,
            count: LOCK_ORDER.reduce((sum, col) => sum + (collections[pl.id][col.id].some(c => c.id !== 34 && c.colorId !== 'white' && c.colorId !== 'black') ? 1 : 0), 0)
        }));
        const maxL = Math.max(...lockCounts.map(l => l.count));
        
        // 「最多ロック」かつ「空きスロットが1つ以上ある」プレイヤーが1人でもいるか
        const hasValidTarget = players.some(pl => {
            const myCount = LOCK_ORDER.reduce((sum, col) => sum + (collections[pl.id][col.id].some(c => c.id !== 34 && c.colorId !== 'white' && c.colorId !== 'black') ? 1 : 0), 0);
            const hasEmpty = LOCK_ORDER.some(col => collections[pl.id][col.id].length === 0);
            return myCount === maxL && hasEmpty;
        });
        return hasValidTarget;
    }

    const act = card.handEffect.action;
    if (!act) return true;

    if (card.handEffect.cost) {
        const cost = card.handEffect.cost;if (card.handEffect.cost) {
        const cost = card.handEffect.cost;
        // 【外科手術的修正】card が手札(hands)にない（ロックエリアにある）場合でも、
        // candidates（コストとして捨てられる手札）から自分自身を除外する判定を安全に行う
        const candidates = (hands[p.id] || []).filter(c => (c.colorId === cost.color || c.colorId === 'rainbow') && c !== card);
        if (candidates.length < cost.amount) return false;
    }
        const candidates = hands[p.id].filter(c => (c.colorId === cost.color || c.colorId === 'rainbow') && c !== card);
        if (candidates.length < cost.amount) return false;
    }

    if (act.type === 'civil_path_hand') {
        const emptyCount = board.flat().filter(c => c.empty).length;
        const faceDownCards = [];
        for(let y=0; y<GRID_SIZE; y++) {
            for(let x=0; x<GRID_SIZE; x++) {
                const cell = board[y][x];
                if(cell.empty || cell.revealed) continue;
                let isAroundOpponent = false;
                players.forEach(pl => {
                    if(pl.id === p.id) return;
                    if(Math.abs(pl.x - x) <= 1 && Math.abs(pl.y - y) <= 1) isAroundOpponent = true;
                });
                if(!isAroundOpponent) faceDownCards.push({x, y});
            }
        }
        if (emptyCount < 2 || faceDownCards.length < 2) return false;
    }
    
    else if (act.type === 'apocalypse_arrival') {
        const pHand = hands[p.id] || [];
        const candidates = pHand.filter(c => c !== contextCard && (!p.currentArrivalCard || c !== p.currentArrivalCard));
        
        if (candidates.length === 0) {
            addLog(`[System] ${p.name}は配置できる手札がありません。`); 
            
            // 修正箇所：他のモーダル（到達確認等）が閉じるのを待ってから表示
            setTimeout(() => {
                showMessageOverlay("配置できる手札がないため、\n予言者の技は不発に終わりました。", 2000, () => {
                    if(typeof onSuccess === 'function') onSuccess({});
                });
            }, 500); 
            return;
        }

        showSelectionModal("アポカリプス：配置", "裏向きで配置する手札を1枚選択", candidates, "card-back-pattern", 1, (selCards) => {
            const cardToPlace = selCards[0]; 
            const hIdx = hands[p.id].indexOf(cardToPlace);
            if(hIdx > -1) hands[p.id].splice(hIdx, 1);
            
            activeHandCard = cardToPlace;
            startSelectionMode('select_cell', 1, 'apocalypse_placed_logic', "配置するマスを選択（周囲1マス）", onSuccess, 1, null, true, p, true, null, null, null, p);
        }, false, null, null, null, p); 
        return;
    }

    if ((act.type === 'select_cell' || act.type === 'select_line') && act.range !== null && act.range !== undefined) {
        let validCount = 0;
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const dx = Math.abs(p.x - x), dy = Math.abs(p.y - y);
                let inRange = act.isEightDirection ? (dx <= act.range && dy <= act.range) : (dx + dy <= act.range);
                if (inRange) {
                    const cell = board[y][x];
                    let selectable = true;
                    if (['add_to_hand', 'destroy_all', 'destroy_top'].includes(act.logic) && (cell.empty || cell.color.type === 'FIRST' || cell.color.type === 'ETERNAL')) selectable = false;
                    if (act.logic === 'open_facedown' && (cell.empty || cell.revealed)) selectable = false;
                    if (selectable) validCount++;
                }
            }
        }
        if (validCount === 0) return false;
    }
    return true;
}

/**
 * 2026/03/06 修正
 * 効果発動ログをプレイヤーカラー＋アイコン「✨ EFFECT」に変更し、視認性を向上。
 */
/** 2026/03/10 修正：到達効果と手札効果のログを明確に判別 **/
function executeCardEffect(def, p, onSuccess, contextCard = null, isNewReveal = false) {
    // 【外科手術的修正】発動タイプに応じたタグと色の設定
    if (contextCard && contextCard.name) {
        // 到達効果か手札効果かを判定（isNewRevealが渡される、または盤面から呼ばれるのが到達）
        // 簡易判定：activeHandCard が存在し、かつ contextCard と一致すれば手札効果
        const isHandTrigger = (typeof activeHandCard !== 'undefined' && activeHandCard === contextCard);
        
        const typeTag = isHandTrigger 
            ? '<span class="text-orange-400">🎴 HAND EFFECT</span>' 
            : '<span class="text-blue-400">✨ ARRIVAL EFFECT</span>';

        addLog(`<span style="color:${p.color.hex}">●</span> <b>${p.name}</b> ${typeTag} 『${contextCard.name}』`);
    }

    if (!def) { 
        isHandEffectProcessing = false; 
        onSuccess({}); 
        return; 
    }
    
    const wrappedSuccess = (res) => {
        isHandEffectProcessing = false;

        // 【追加】自動処理によって発動していた場合、効果解決が終わった時点でフラグを解除
        if (isAutoProcessing) {
            isAutoProcessing = false;
            isAutoAction = false;
        }
        
        // 【追加】1ターンに1度制限のカード（ID 11: ヴァーディアンなど）なら記録
        const oncePerTurnIDs = [11]; 
        if (contextCard && oncePerTurnIDs.includes(contextCard.id)) {
            usedOnceEffectsThisTurn.push(contextCard.id);
        }

        if (onSuccess) onSuccess(res);
    };

    

    if (def.cost) {
        const candidates = hands[p.id].filter(c => (c.colorId === def.cost.color || c.colorId === 'rainbow') && c !== contextCard);
        if (candidates.length < def.cost.amount) { 
            showToast("コスト不足"); 
            isHandEffectProcessing = false; 
            return; 
        }
        showSelectionModal("コスト支払い", "捨てるカードを選択してください", candidates, "card-back-pattern", def.cost.amount, (sel) => {
            /** 2026/03/09 修正：コスト支払いのログを詳細化 **/
            // 1. まずコスト（追色に使ったカード）を捨てる
            sel.forEach(c => { 
                const curIdx = hands[p.id].indexOf(c); 
                if(curIdx > -1) {
                    const removed = hands[p.id].splice(curIdx, 1)[0];
                    // プレイヤー名と強調されたカード名を表示
                    addLog(`[${p.name}] がコストとして 『${removed.name}』 を捨てました。`);
                    discardPile.push(removed); 
                }
            });

            /** 2026/03/09 修正：FIRST/ETERNALカード発動時のフリーズを防止 **/
            // 2. 発動した本体カードの特定
            const cardToDiscard = contextCard || activeHandCard;
            const selfIdx = hands[p.id].indexOf(cardToDiscard);
            
            if (selfIdx > -1) {
                // セレナーデ(FIRST)やワイナウエア(ETERNAL)は手札から取り除くだけで、捨て札には送らない
                const isPermanent = cardToDiscard.type === 'FIRST' || cardToDiscard.type === 'ETERNAL';
                
                if (isPermanent) {
                    // 永続カードは手札から抜くだけ（この後ロックエリア等へ移動するため）
                    hands[p.id].splice(selfIdx, 1);
                } else {
                    // 通常カードは手札から抜いて捨て札へ
                    const removed = hands[p.id].splice(selfIdx, 1)[0];
                    if (!(def.action && def.action.stayOnBoard)) {
                        discardCard(removed);
                    }
                }
            }

            renderHand(); 
            renderDeckAndDiscard(); // 捨て場の枚数を即更新

            // 3. アクションの実行（カードは既に手札にない状態）
            runAction(def.action, p, (res) => {
                wrappedSuccess(res);
            }, contextCard, isNewReveal);

        }, false, () => {
            isHandEffectProcessing = false;
        }, null, null, null, p); // AIが迷わないよう第11引数にプレイヤーを渡す
    
    
    
    } else {
        // コストがない場合も同様
        const handIdx = activeHandCard ? hands[p.id].indexOf(activeHandCard) : -1;
        const usedCard = handIdx > -1 ? hands[p.id].splice(handIdx, 1)[0] : null;
        
        renderHand();

        if (def.action) {
            runAction(def.action, p, (res) => {
                // 効果解決後に判定
                if (usedCard && !(res && res.stayOnBoard)) {
                    discardPile.push(usedCard);
                }
                wrappedSuccess(res);
            }, contextCard, isNewReveal);
        } else { 
            if (usedCard) discardPile.push(usedCard); // アクションなしなら通常破棄
            if(def.msg) addLog(def.msg); 
            isHandEffectProcessing = false; 
            onSuccess({}); 
        }
    }
}

function runAction(act, p, onSuccess, contextCard = null, isNewReveal = false) {
    if (!act) { if (onSuccess) onSuccess({}); return; }

    /** 安全なカウントアップ処理へ差し替え **/
    if (!matchStats.handEffectUsedCount) matchStats.handEffectUsedCount = {};
    matchStats.handEffectUsedCount[p.id] = (matchStats.handEffectUsedCount[p.id] || 0) + 1;

    if (contextCard && contextCard.type === 'FIRST') {
        if (!matchStats.firstCardUseCount) matchStats.firstCardUseCount = {};
        matchStats.firstCardUseCount[p.id] = (matchStats.firstCardUseCount[p.id] || 0) + 1;
    }

    /** 2026/03/09 修正：長期称号「0thの理解者」用の使用履歴記録 **/
    if (p.id === 1 && contextCard && contextCard.id) {
        if (!userProfile.usedCardIds) userProfile.usedCardIds = [];
        if (!userProfile.usedCardIds.includes(contextCard.id)) {
            userProfile.usedCardIds.push(contextCard.id);
            addLog(`[History] 新しいカード「${contextCard.name}」の真髄を理解しました。`);
        }
    }

    // ★既存：発動回数の記録
    if (contextCard && contextCard.name) {
        if (!cardUsageStats[p.id]) cardUsageStats[p.id] = {};
        cardUsageStats[p.id][contextCard.name] = (cardUsageStats[p.id][contextCard.name] || 0) + 1;
    }

    const forceNoCancel = true;

    if (act.type === 'nanairo_no_ame_hand') {
        // ステップ1：向き（縦か横か）を先に選ぶ
        showDetailModal("なないろのあめ", "列の向きを選択してください", null, "横一列", () => {
            // 横を選択した場合：各行(y=0〜6)の左端(x=0)を選択肢として提示
            const rowChoices = [];
            for(let i=0; i<GRID_SIZE; i++) rowChoices.push({x: 0, y: i});
            
            startSelectionMode('select_cell', 1, 'fill_line_horizontal', '対象の「行」を選択してください', (sel) => {
                const coords = []; for(let i=0; i<GRID_SIZE; i++) coords.push({x: i, y: sel[0].y});
                executeSelectionLogic('place_deck_sequential_rainbow', coords, onSuccess);
            }, null, null, true, p, false, null, "おまかせ", rowChoices, p);
            
        });

        const dCancelBtn = document.getElementById('detail-cancel-btn');
        if (dCancelBtn) {
            dCancelBtn.textContent = "縦一列";
            dCancelBtn.onclick = () => {
                closeDetailModal();
                // 縦を選択した場合：各列(x=0〜6)の上端(y=0)を選択肢として提示
                const colChoices = [];
                for(let i=0; i<GRID_SIZE; i++) colChoices.push({x: i, y: 0});
                
                startSelectionMode('select_cell', 1, 'fill_line_vertical', '対象の「列」を選択してください', (sel) => {
                    const coords = []; for(let i=0; i<GRID_SIZE; i++) coords.push({x: sel[0].x, y: i});
                    executeSelectionLogic('place_deck_sequential_rainbow', coords, onSuccess);
                }, null, null, true, p, false, null, "おまかせ", colChoices, p);
            };
        }
        return;
    }

    if (act.type === 'apocalypse_hand') {
        const startApocalypseFlow = () => {
            showSelectionModal("色宣言 (アポカリプス)", "宣言する色を2色選んでください", BASE_COLORS, "card-back-pattern", 2, (selCols) => {
                const targetIds = selCols.map(c => c.id);
                
                // 宣言内容のHTML構築（文字を大きく、背景チップ付きで表示）
                const colNames = selCols.map(c => `<span class="${c.bg} px-4 py-2 rounded-lg text-white mx-2 shadow-lg text-xl font-black">${c.name}</span>`).join(' <span class="text-gray-400">と</span> ');
                const declarationMsg = `<div class="text-center">
                    <p class="text-sm text-gray-400 mb-4">${p.name} の予言...</p>
                    <div class="flex justify-center items-center">${colNames}</div>
                </div>`;

                // showMessageOverlay を使用して2秒間表示し、その後に自動でドロー処理へ
                showMessageOverlay(declarationMsg, 3000, () => {
                    const drawn = drawCard();
                    if (!drawn) {
                        addLog("山札切れのため終了します。");
                        if (onSuccess) onSuccess({});
                        return;
                    }
                    
                    showCardModal(drawn, () => {
                        hands[p.id].push(drawn);
                        renderHand();
                        if (targetIds.includes(drawn.colorId) || drawn.colorId === 'rainbow') {
                            addLog(`的中！「${drawn.name}」を引き当てました。`);
                            /** 2026/03/09 修正：称号「予言の完成者」用の連続カウント **/
                            matchStats.apocalypseChain[p.id] = (matchStats.apocalypseChain[p.id] || 0) + 1;
                            showMessageOverlay("予言的中！\n効果を繰り返します。", 1500, startApocalypseFlow);
                        } else {
                            addLog(`不的中。「${drawn.name}」でした。`);
                            // 失敗したらリセット
                            matchStats.apocalypseChain[p.id] = 0;
                            showMessageOverlay("予言失敗。\n効果を終了します。", 1500, () => {
                                if (onSuccess) onSuccess({});
                            });
                        }
                    }, "ドロー＆公開", p.name, "アポカリプス予言解決中...");
                });

            }, false, () => { if(onSuccess) onSuccess({}); }, null, null, p);
        };
        startApocalypseFlow();
        return;
    }

    if (act.type === 'apocalypse_arrival') {
        // 配置可能な手札（自分自身を除く）を抽出
        const candidates = hands[p.id].filter(c => c !== contextCard);

        if (candidates.length === 0) {
            // 手札がない場合、不発のモーダルを表示して終了
            showMessageOverlay("配置できる手札がないため、\n予言者の技は不発に終わりました。", 2500, () => {
                addLog(`[System] ${p.name}は手札がないため配置不能。`);
                if (onSuccess) onSuccess({});
            });
            return;
        }

        // 手札がある場合は通常通り選択モーダルを表示
        showSelectionModal("アポカリプス：配置", "裏向きで配置する手札を1枚選択", candidates, "card-back-pattern", 1, (selCards) => {
            const cardToPlace = selCards[0]; 
            hands[p.id].splice(hands[p.id].indexOf(cardToPlace), 1);
            activeHandCard = cardToPlace;
            startSelectionMode('select_cell', 1, 'apocalypse_placed_logic', "配置するマスを選択（周囲1マス）", onSuccess, 1, null, true, p, true, null, null, null, p);
        }, false, null, null, null, p); 
        return;
    }

    if (act.type === 'select_cell' || act.type === 'select_line' || act.type === 'select_cell_adjacent') {
        const logicName = act.logic;
        const promptText = act.prompt || '対象のマスを選択してください';
        
        const myPos = { x: p.x, y: p.y };
        const forbidden = (act.type === 'select_cell_adjacent') ? myPos : null;

        const handleSuccess = (res) => {
            if (onSuccess) onSuccess(res);
        };

        let validCount = 0;
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = board[y][x];
                let isPotentiallySelectable = true;

                if (forbidden && x === forbidden.x && y === forbidden.y) {
                    isPotentiallySelectable = false;
                }

                if (isPotentiallySelectable && act.range !== null && act.range !== undefined) {
                    const dx = Math.abs(p.x - x), dy = Math.abs(p.y - y);
                    let inRange = act.isEightDirection ? (dx <= act.range && dy <= act.range) : (dx + dy <= act.range);
                    if (!inRange) isPotentiallySelectable = false;
                }
                
                if (isPotentiallySelectable) {
                    // ★ 外科手術的修正：CPU(NORMAL以上)の損切りロジック
                    // 到達効果（isNewReveal=falseかつ駒がその場にある）において、
                    // 自分の足元のカードを「獲得（add_all_to_hand）」対象から外す
                    if (isAutoAction && autoMode === 'NORMAL') {
                        if (logicName === 'add_all_to_hand' && x === p.x && y === p.y) {
                            isPotentiallySelectable = false;
                        }
                    }

                    if (isPotentiallySelectable && ['place_deck_facedown_empty', 'place_self_facedown_empty', 'place_deck_sequential_empty'].includes(logicName)) {
                        if (!cell.empty) isPotentiallySelectable = false;
                    } else if (['add_to_hand', 'add_all_to_hand', 'destroy_all', 'destroy_top', 'civil_path_step1', 'open_facedown', 'gentecnique_logic'].includes(logicName)) {
                        if (cell.empty) isPotentiallySelectable = false;
                        if (!cell.empty && ['add_to_hand', 'add_all_to_hand', 'destroy_all', 'destroy_top', 'gentecnique_logic'].includes(logicName)) {
                            if (cell.color.type === 'FIRST' || cell.color.type === 'ETERNAL') isPotentiallySelectable = false;
                        }
                    } else if (logicName === 'move_player') {
                        // 他人の駒があるマスは移動不可
                        const hasOtherPiece = players.some(otherP => otherP.id !== p.id && otherP.x === x && otherP.y === y);
                        
                        // 【修正】「カードがないマス(empty)」または「他人の駒がある」または「自分の現在地」なら移動不可
                        if (cell.empty || hasOtherPiece || (x === p.x && y === p.y)) {
                            isPotentiallySelectable = false;
                        }
                    }

                    if (act.restrictedCells && !act.restrictedCells.some(rc => rc.x === x && rc.y === y)) isPotentiallySelectable = false;
                }

                if (isPotentiallySelectable) validCount++;
            }
        }

        const finalCount = Math.min(act.count || 1, validCount);
        if (finalCount <= 0) {
            const failMsg = (logicName === 'move_player') ? "追加移動できるマスがないため、効果を終了します。" : "対象がないため、効果を終了します。";
            addLog(`[System] ${failMsg}`);

            // ★外科手術的修正：自動処理（AI）の場合はオーバーレイを表示せず即座に次へ進める
            if (isAutoAction) {
                if (onSuccess) onSuccess({});
            } else {
                // 人間の場合はメッセージを見せてから次へ
                showMessageOverlay(failMsg, 1500, () => { 
                    if (onSuccess) onSuccess({}); 
                });
            }
            return;
        }
        
        const forceNoCancel = !!act.noCancel;
        startSelectionMode(act.type, act.count || 1, logicName, promptText, handleSuccess, act.range, forbidden, forceNoCancel, p, act.isEightDirection, null, "おまかせ", act.restrictedCells || null, p); 
        return;
    }

    if (act.type === 'select_line') {
        startSelectionMode('select_line', 1, act.logic, act.prompt, (selection) => { if (onSuccess) onSuccess({ selection }); }, null, null, false, p, false, () => { if(onSuccess) onSuccess({ cancelled: true }); }, null, null, p);
        return;
    }

    if (act.type === 'thunder_hand') {
        const validCells = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (!board[y][x].empty) validCells.push({ x, y });
            }
        }

        if (validCells.length === 0) {
            addLog("破壊できるカードが盤面にありません。");
            if (onSuccess) onSuccess({});
            return;
        }

        startSelectionMode('select_cell', 1, 'thunder_animate_logic', '破壊するマスを選択', async (selection) => {
            if (!selection || selection.length === 0) { 
                if (onSuccess) onSuccess({}); 
                return; 
            }
            
            const pos = selection[0];
            const boardEl = document.getElementById('board-grid');
            const targetEl = boardEl.children[pos.y * GRID_SIZE + pos.x];

            // 1. ビリビリ演出
            if (targetEl) targetEl.classList.add('biribiri-active');
            await new Promise(r => setTimeout(r, 1500)); // 少し短縮してテンポアップ

            // 2. 雷エフェクト ＆ 雷の効果音
            if (typeof triggerLightningEffect === 'function') triggerLightningEffect();
            if (typeof playSE === 'function') playSE('se_thunder_impact.mp3');

            await new Promise(r => setTimeout(r, 300));
            if (targetEl) targetEl.classList.remove('biribiri-active');

            // ★ 粉砕演出の実行（データ削除の前に行う）
            if (typeof triggerCardShatterEffect === 'function') {
                await triggerCardShatterEffect(pos.x, pos.y);
            }

            await new Promise(r => setTimeout(r, 400)); 

            // 3. 【重要】カード削除ロジックの完全復元
            const target = board[pos.y][pos.x];
            if (target && !target.empty) {
                // 捨て札へ送る
                if (target.color) discardPile.push(target.color);
                if (target.stack && target.stack.length > 0) {
                    target.stack.forEach(c => discardPile.push(c));
                }
                
                // データの初期化
                target.empty = true;
                target.revealed = false;
                target.color = null;
                target.stack = [];
                
                addLog(`神鳴：(${pos.x}, ${pos.y}) のカードを粉砕しました。`);
                
                // 再描画
                if (typeof renderBoard === 'function') renderBoard();
                if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard();
            }

            if (onSuccess) onSuccess({});
        }, null, null, true, p, false, null, "おまかせ", validCells, p);
        return;
    }

    if (act.type === 'rich_whim_hand') { 
        startSelectionMode('select_cell', 2, 'place_deck_facedown', '山札から裏向きで置くマスを2つ選択', (selection) => {
            if (!selection || selection.length === 0) { if (onSuccess) onSuccess({}); return; }
            let idx = 0;
            const processNext = () => {
                if (idx >= selection.length) { if (onSuccess) onSuccess({}); return; }
                const pos = selection[idx];
                executeSelectionLogic('place_deck_facedown', [pos], () => {
                    const el = document.querySelector(`#board-grid > div:nth-child(${pos.y * GRID_SIZE + pos.x + 1})`);
                    if (el) el.classList.add('ring-4', 'ring-yellow-400', 'z-50', 'transition-all');
                    setTimeout(() => {
                        if (el) el.classList.remove('ring-4', 'ring-yellow-400', 'z-50');
                        idx++;
                        processNext();
                    }, 200);
                });
            };
            processNext();
        }, 7, null, true, p); 
        return; 
    }

    if (act.type === 'civil_path_hand') {
        const faceDownCards = [];
        for(let y=0; y<GRID_SIZE; y++) {
            for(let x=0; x<GRID_SIZE; x++) {
                const cell = board[y][x];
                if(!cell.empty && !cell.revealed) {
                    let isAroundOpponent = false;
                    players.forEach(pl => { if(pl.id === p.id) return; if(Math.abs(pl.x - x) <= 1 && Math.abs(pl.y - y) <= 1) isAroundOpponent = true; });
                    if(!isAroundOpponent) faceDownCards.push({x, y});
                }
            }
        }
        const emptyCells = board.flat().filter(c => c.empty);
        if (faceDownCards.length < 2 || emptyCells.length < 2) { showMessageOverlay("移動させるカード、または移動先の空きマスが足りません。", 2500, () => { if(onSuccess) onSuccess({}); }); return; }

        // 移動演出用の非同期関数
        const animateCivilPath = async (fromPosList, toPosList) => {
            const boardEl = document.getElementById('board-grid');
            
            for (let i = 0; i < fromPosList.length; i++) {
                const from = fromPosList[i];
                const to = toPosList[i];
                const fromIdx = from.y * GRID_SIZE + from.x;
                const toIdx = to.y * GRID_SIZE + to.x;
                
                const fromEl = boardEl.children[fromIdx];
                const toEl = boardEl.children[toIdx];
                
                const movingData = board[from.y][from.x];
                const cardData = movingData.color; // 一番上のカードを保持
                // stackData は移動させず、一番上のみを動かす

                // 1. 移動元の発光演出 (約1秒)
                if (typeof triggerCellFlash === 'function') {
                    triggerCellFlash(from.x, from.y, '#22c55e');
                }
                await new Promise(r => setTimeout(r, 1000));

                // 2. スライド移動の準備
                const cardImg = fromEl.querySelector('.card-back-pattern');
                if (!cardImg) continue;
                
                const rectFrom = fromEl.getBoundingClientRect();
                const rectTo = toEl.getBoundingClientRect();
                
                const clone = cardImg.cloneNode(true);
                clone.style.position = 'fixed';
                clone.style.top = rectFrom.top + 'px';
                clone.style.left = rectFrom.left + 'px';
                clone.style.width = rectFrom.width + 'px';
                clone.style.height = rectFrom.height + 'px';
                clone.style.zIndex = '1000';
                clone.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                document.body.appendChild(clone);
                
                // 【外科手術的修正】一番上のみを抜き取り、スタックがあれば次を color に昇格させる
                if (movingData.stack && movingData.stack.length > 0) {
                    const nextCard = movingData.stack.shift(); // スタックから1枚取り出す
                    movingData.color = nextCard; // それをマスの表面（color）にする
                    // empty, revealed はそのまま維持
                } else {
                    // スタックがなければマスを空にする
                    movingData.empty = true;
                    movingData.color = null;
                    movingData.stack = [];
                }
                renderBoard();

                // 移動アニメーション開始
                requestAnimationFrame(() => {
                    clone.style.top = rectTo.top + 'px';
                    clone.style.left = rectTo.left + 'px';
                    clone.style.transform = 'scale(1.1)';
                });

                await new Promise(r => setTimeout(r, 650));

                // 3. 移動先にデータをセット（移動先は常に空マスなので、stackは空でセット）
                const destData = board[to.y][to.x];
                destData.empty = false;
                destData.color = cardData; // 抜き取った一番上のカード
                destData.revealed = false;
                destData.stack = []; // 移動先は空だったので、スタックは空
                
                clone.remove();
                renderBoard();

                // 4. 移動先の発光演出 (約1秒)
                if (typeof triggerCellFlash === 'function') {
                    triggerCellFlash(to.x, to.y, '#22c55e');
                }
                addLog(`民の道：カードを(${from.x},${from.y})から(${to.x},${to.y})へ移動。`);
                await new Promise(r => setTimeout(r, 1000));
            }
            if (onSuccess) onSuccess({});
        };

        /** 2026/03/09 修正：「民の道の建設」の移動先から相手の周囲を除外 **/
        // 1段階目：移動させるカードを選択
        startSelectionMode('select_cell', 2, 'civil_path_step1_dummy', '移動させる裏向きカードを2枚選択', (selectedFrom) => {
            // 2段階目：移動先を選択
            setTimeout(() => {
                // CPU（または「おまかせ」）の場合、移動先候補から相手の周囲を除外する
                let validDestCells = null;
                const opponents = players.filter(pl => pl.id !== p.id);
                
                // 全ての空きマスのうち、相手の周囲8マスに含まれないマスをリストアップ
                const safeDestinations = board.flat().filter(cell => {
                    if (!cell.empty) return false;
                    // 相手の誰かの周囲1マス以内ならNG
                    const isNearOpponent = opponents.some(opp => 
                        Math.abs(opp.x - cell.x) <= 1 && Math.abs(opp.y - cell.y) <= 1
                    );
                    return !isNearOpponent;
                }).map(cell => ({ x: cell.x, y: cell.y }));

                // 候補がある場合のみ制限をかける（候補ゼロで詰まるのを防ぐため）
                if (safeDestinations.length >= 2) {
                    validDestCells = safeDestinations;
                }

                startSelectionMode('select_cell', 2, 'civil_path_step2_dummy', '移動先の空きマスを選択', (selectedTo) => {
                    animateCivilPath(selectedFrom, selectedTo);
                }, null, null, true, p, false, null, "おまかせ", validDestCells, p);
            }, 300);
        }, null, null, true, p, false, null, "おまかせ", faceDownCards, p);
        return;
    }

    if (act.type === 'nanairo_no_ame') {
        const targets = [];
        // 到達効果は「空きマスのみ」が対象
        board.forEach((row, y) => row.forEach((cell, x) => { 
            if(cell.empty) targets.push({x, y}); 
        }));
        
        if (targets.length === 0) {
            if (onSuccess) onSuccess({});
            return;
        }

        // 演出を実行。第3引数のコールバックが「全アニメーション終了後」に実行される
        executeSelectionLogic('place_deck_sequential_rainbow', targets, (res) => {
            // ここで onSuccess を呼ぶことで、演出が終わってから獲得モーダルが出る
            if (onSuccess) onSuccess(res);
        });
        return;
    }

    else if (act.type === 'select_cell_outside') { startSelectionMode('select_cell_outside', act.count, act.logic, act.prompt, onSuccess, act.range, null, forceNoCancel, p, false, null, "おまかせ", null, p); return; }

    // --- 誰かの落とし物 (ID: 23) ---
    else if (act.type === 'lost_item_hand') {
        const enemyGates = players.filter(pl => pl.id !== p.id).map(pl => pl.startPos);
        startSelectionMode('select_cell', 1, 'lost_item_target', '配置する相手ゲートを1つ選択', (sel) => {
            const card = drawCard(); 
            if (card) {
                // ドローしたカードを表示してから手札に加える
                showCardModal(card, () => {
                    if (hands[p.id]) hands[p.id].push(card);
                    renderHand();
                    if (onSuccess) onSuccess({ stayOnBoard: true });
                }, "ドロー", p.name, "獲得しました");
            } else {
                if (onSuccess) onSuccess({ stayOnBoard: true });
            }
        }, null, null, true, null, false, null, "おまかせ", enemyGates, p);
        return;
    }

    else if (act.type === 'draw_reveal_seal') {
        const drawn = []; for(let i=0; i<act.value; i++){ const c = drawCard(); if(c) { c.sealed = true; c.isPublic = true; hands[p.id].push(c); drawn.push(c); } }
        if (drawn.length > 0) showCardModal(drawn, () => onSuccess({}), "ドロー＆公開", p.name, "情報開示を発動しました"); else onSuccess({}); return;
    }

    // --- 仕掛けられた罠 (ID: 26) ---
    else if (act.type === 'trapped_trap_hand') { 
        // ★ 2026/03/08 04:45 修正：設置制限の再修正（カードのあるマスにも置けるように）
        const validTrapCells = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                // 1. 自分自身の周囲（1マス以内）は設置不可
                if (Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1) continue;

                // 2. そのマスの周囲8マスに「破壊可能なカード」があるかチェック
                let hasCardAround = false;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                            const targetCell = board[ny][nx];
                            // 周囲のマスにカードがあり、かつ破壊可能（NORMAL/BOOST等）なら有効
                            if (!targetCell.empty && targetCell.color && 
                                targetCell.color.type !== 'FIRST' && targetCell.color.type !== 'ETERNAL') {
                                hasCardAround = true;
                                break;
                            }
                        }
                    }
                    if (hasCardAround) break;
                }

                // 周囲に破壊対象があれば、設置するマス自体の空き状況に関わらずリストに入れる
                if (hasCardAround) {
                    validTrapCells.push({ x, y });
                }
            }
        }

        if (validTrapCells.length === 0) {
            showMessageOverlay("周囲に破壊できるカードがあるマスが\nないため、罠を仕掛けられません。", 2500);
            if (onSuccess) onSuccess({});
            return;
        }

        // 制限リスト（validTrapCells）を渡して選択開始
        startSelectionMode('select_cell_outside', 1, 'trapped_trap_step1', "罠を設置するマスを選択してください（周囲以外）", (res) => {
            if (onSuccess) onSuccess({ stayOnBoard: true });
        }, null, null, true, p, false, null, "おまかせ", validTrapCells, p); 
        return; 
    }

    else if (act.type === 'rainbow_fragment_choice') {
        const pHand = hands[p.id] || [];
        const otherFragsCount = pHand.filter(c => Number(c.id) === 29 && c !== contextCard).length;
        const canDouble = (otherFragsCount + 1) >= 2; 

        // --- 内部関数：1枚ドロー処理 ---
        const executeSingle = () => {
            const c = drawCard();
            if (c) {
                showCardModal(c, () => {
                    hands[p.id].push(c);
                    if (typeof renderHand === 'function') renderHand();
                    onSuccess({});
                }, "ドロー", p.name, "「1枚ドロー」を選択しました");

                // ★ 2026/03/07 追加
                if (isAutoAction) {
                    setTimeout(() => {
                        const okBtn = document.getElementById('arrival-ok-btn');
                        if (okBtn) okBtn.click();
                    }, 1500);
                }
            } else onSuccess({});
        };

        // --- 内部関数：2枚ロック＆2枚ドロー処理 ---
        const executeDouble = () => {
            const colorOptions = [...BASE_COLORS].reverse().filter(bc => {
                const slot = collections[p.id][bc.id] || [];
                return slot.length === 0 || slot.some(card => card.id === 34);
            });

            if (colorOptions.length === 0) {
                if(typeof showToast === 'function') showToast("ロックできるスロットがありません");
                onSuccess({}); return;
            }

            // ロック先の選択
            showSelectionModal("ロック先選択", "2枚をどの色としてロックしますか？", colorOptions, "card-back-pattern", 1, (sel) => {
                // --- 2026/03/07 修正：ここにあった isAutoAction = false; を削除または移動 ---
                
                const targetColor = sel[0];
                const tSlot = collections[p.id][targetColor.id];
                
                const curseIdx = tSlot.findIndex(c => c.id === 34);
                if (curseIdx > -1) {
                    tSlot.splice(curseIdx, 1);
                    addLog(`「なないろの欠片」の力で${targetColor.name}の呪いが解けました！`);
                }
                
                const secondIdx = hands[p.id].findIndex(c => Number(c.id) === 29 && c !== contextCard);
                if (secondIdx === -1) { 
                    onSuccess({}); return; 
                }
                const frag2 = hands[p.id].splice(secondIdx, 1)[0];
                tSlot.push(contextCard);
                tSlot.push(frag2);

                const drawn = [];
                for (let k = 0; k < 2; k++) {
                    const c = drawCard();
                    if (c) { hands[p.id].push(c); drawn.push(c); }
                }
                
                showCardModal(drawn, () => {
                    if (typeof checkWin === 'function') checkWin(p.id);
                    if (typeof renderStatus === 'function') renderStatus();
                    if (typeof renderHand === 'function') renderHand();
                    onSuccess({ stayOnBoard: true });
                }, "2枚ロック＆ドロー", p.name, `「${targetColor.name}」としてロックしました`);
                
                // ★ 2026/03/07 追加：isAutoAction が生きているうちに判定を行う
                if (isAutoAction) {
                    setTimeout(() => {
                        const okBtn = document.getElementById('arrival-ok-btn');
                        if (okBtn) okBtn.click();
                        // モーダルが閉じるタイミングでフラグを折る
                        isAutoAction = false; 
                    }, 2000);
                } else {
                    isAutoAction = false; // 手動時も念のため
                }
            }, false, () => { isAutoAction = false; startFlow(); }, null, null, p);
        };

        const startFlow = () => {
            // ★ 外科手術：自動処理なら「二択画面」を作らずに即座に分岐
            if (isAutoAction) {
                const choiceText = canDouble ? "【2枚ロック＆2枚ドロー】" : "【1枚ドロー】";
                addLog(`[Auto] ${p.name}は「なないろの欠片」の効果で ${choiceText} を選択。`);
                
                // 全プレイヤーへの知らしめモーダル（スキップしない）
                showMessageOverlay(`${p.name} の選択：\n${choiceText}`, 1500, () => {
                    if (canDouble) executeDouble();
                    else executeSingle();
                });
                return; 
            }

            // 手動操作時のみ二択モーダルを表示
            const choiceModal = document.createElement('div');
            choiceModal.className = "fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4";
            choiceModal.innerHTML = `
                <div class="bg-gray-800 border-2 border-yellow-500 p-6 rounded-xl text-center shadow-2xl max-w-sm w-full">
                    <h3 class="text-white font-bold text-lg mb-2">なないろの欠片</h3>
                    <p class="text-gray-400 text-[10px] mb-4 text-left">使用する効果を選択してください</p>
                    <div class="flex flex-col gap-3">
                        <button id="btn-choice-single" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg flex flex-col items-center">
                            <span>1枚ドロー</span>
                        </button>
                        <button id="btn-choice-double" class="${canDouble ? 'bg-yellow-600 hover:bg-yellow-500 text-black' : 'bg-gray-700 text-gray-500 cursor-not-allowed'} font-bold py-3 rounded-lg shadow-lg flex flex-col items-center relative overflow-hidden transition-colors">
                            <span>2枚ロック ＆ 2枚ドロー</span>
                        </button>
                    </div>
                </div>`;
            document.body.appendChild(choiceModal);

            choiceModal.querySelector('#btn-choice-single').onclick = () => {
                choiceModal.remove();
                executeSingle();
            };

            if (canDouble) {
                choiceModal.querySelector('#btn-choice-double').onclick = () => {
                    choiceModal.remove();
                    executeDouble();
                };
            }
        };

        startFlow();
        return;
    }

    else if (act.type === 'greedy_choice') {
        const hasHand = (hands[p.id] || []).length > 0;
        if (!hasHand) {
            // 【修正箇所】showDetailModal を廃止し、showMessageOverlay を使用
            showMessageOverlay("手札がないため獲得のみ行い、\n元の場所へ戻ります。", 2500, () => {
                const targetCell = board[p.y][p.x];
                targetCell.revealed = false; 
                if(p.prevX !== -1 && (p.x !== p.prevX || p.y !== p.prevY)) {
                    p.x = p.prevX;
                    p.y = p.prevY;
                }
                updateGameState();
                onSuccess({});
            });
        } else {
            const msg = "手札を1枚捨てて獲得しますか？\n（「捨てない」を選択すると元の場所へ戻り、カード獲得します）";
            showDetailModal("欲しがりの吊り橋", msg, null, "１枚捨てる", () => {
            showSelectionModal("手札を捨てる", "捨てるカードを選択してください", hands[p.id], "card-back-pattern", 1, (sel) => { 
            sel.forEach(c => { 
            const curIdx = hands[p.id].indexOf(c); if(curIdx > -1) hands[p.id].splice(curIdx, 1); 
            discardPile.push(c); }); renderHand(); onSuccess({}); }, false, null, null, null, p); }); 
            const cnl = document.getElementById('detail-cancel-btn'); cnl.textContent = "捨てない"; cnl.onclick = () => { 
            const targetCell = board[p.y][p.x]; targetCell.revealed = false; 
            if(p.prevX !== -1 && (p.x !== p.prevX || p.y !== p.prevY)) { p.x = p.prevX; p.y = p.prevY; } 
            updateGameState(); onSuccess({}); closeDetailModal(); }; } return; } 
    
    else if (act.type === 'info_disclosure') {
        const targets = [{x:3, y:3}, {x:0, y:0}, {x:GRID_SIZE-1, y:0}, {x:0, y:GRID_SIZE-1}, {x:GRID_SIZE-1, y:GRID_SIZE-1}]; 
        const validTargets = targets.filter(t => !board[t.y][t.x].empty && !board[t.y][t.x].revealed);
        
        // 演出用の非同期関数
        const animateOpen = async (selectedPosList) => {
            if (typeof cancelSelection === 'function') cancelSelection(true);

            for (const pos of selectedPosList) {
                const targetCell = board[pos.y][pos.x];
                if (!targetCell || targetCell.empty || targetCell.revealed) continue;
                
                targetCell.revealed = true;
                addLog(`情報開示：(${pos.x}, ${pos.y}) をオープン。`);
                
                if (typeof renderBoard === 'function') renderBoard();
                if (typeof triggerCellFlash === 'function') {
                    triggerCellFlash(pos.x, pos.y, targetCell.color.hex || '#ffffff');
                }

                // 【重要】オープンしたマスにプレイヤーがいるか確認
                const pOnCell = players.find(pl => pl.x === pos.x && pl.y === pos.y);
                if (pOnCell) {
                    // 到達処理（モーダル）が終わるまでこのループを一時停止させる
                    await new Promise(resolve => {
                        handleArrivalLogic(targetCell, pOnCell, resolve, targetCell.color, false);
                    });
                } else {
                    // プレイヤーがいない場合は通常の待機時間
                    await new Promise(r => setTimeout(r, 800));
                }
            }
            if (onSuccess) onSuccess({});
        };

        if (validTargets.length > 0) { 
            // 第3引数のロジック名を 'open_facedown' から変更して自動処理との衝突を回避
            startSelectionMode('select_cell', validTargets.length, 'info_disclosure_animate', 'オープンする順番を選択してください（中央と四隅）', (sel) => {
                animateOpen(sel);
            }, null, null, forceNoCancel, p, false, null, "おまかせ", validTargets, p); 
        }
        else { 
            const allFaceDowns = []; 
            /**
 * 2026/03/06 修正
 * 情報開示の例外処理において、除外範囲を「周囲8マス」から「隣(前後左右)4マス」へ修正
 */
            for(let y=0; y<GRID_SIZE; y++) { 
                for(let x=0; x<GRID_SIZE; x++) { 
                    // マンハッタン距離（前後左右の歩数）を計算
                    const dist = Math.abs(p.x - x) + Math.abs(p.y - y); 
                    // 距離が1（隣）より大きく、かつ自分自身（距離0）でもないマスを抽出
                    if (dist > 1) { 
                        if (!board[y][x].empty && !board[y][x].revealed) allFaceDowns.push({x, y}); 
                    } 
                } 
            } 
            /**
 * 2026/03/06 修正
 * 情報開示の例外処理（1枚オープン）において、オープン前にマスの発光点滅演出を追加
 */
            if (allFaceDowns.length > 0) { 
                startSelectionMode('select_cell', 1, 'info_disclosure_animate', 'オープンする裏向きカードを1枚選択（自身の隣以外）', async (sel) => {
                    // ★追加：オープン前に選択されたマスを桃色（情報開示の色）で3回点滅させる
                    if (sel && sel.length > 0) {
                        await animateCellBlink(sel[0].x, sel[0].y, '#f472b6');
                    }
                    animateOpen(sel);
                }, null, null, forceNoCancel, p, false, null, "おまかせ", allFaceDowns, p); 
            } else { 
                addLog("オープンできるカードがありませんでした。"); 
                onSuccess({}); 
            } 
        }
        return;
    }
    
    /** 2026/03/09 修正：「反撃」効果で捨てたカードをモーダル表示 **/
    else if (act.type === 'counter_arrival') {
        const minHand = Math.min(...players.map(pl => hands[pl.id].length));
        if (hands[p.id].length === minHand) {
            // カウントアップ
            matchStats.counterSuccess[p.id] = (matchStats.counterSuccess[p.id] || 0) + 1;
            const drawn = []; 
            for(let i=0; i<2; i++) { 
                const c = drawCard(); 
                if(c) { hands[p.id].push(c); drawn.push(c); } 
            }
            
            showCardModal(drawn, () => { 
                if (hands[p.id].length > 0) { 
                    showSelectionModal(
                        "手札破棄", 
                        "捨てるカードを1枚選んでください", 
                        hands[p.id], 
                        "card-back-pattern", 
                        1, 
                        (sel) => { 
                            const discardedCard = sel[0];
                            hands[p.id].splice(hands[p.id].indexOf(discardedCard), 1); 
                            
                            // 修正：捨てたカードをモーダルで表示してから終了する
                            showCardModal(discardedCard, () => {
                                discardCard(discardedCard); // 共通関数でログ出力と破棄を実行
                                onSuccess({});
                            }, "反撃：手札破棄", p.name, "このカードを捨てました");
                        }, 
                        false, null, null, null, p
                    ); 
                } else onSuccess({}); 
            }, "反撃ドロー", p.name, "発動しました");
        } else {
            // （不発処理）
            addLog(`${p.name}の手札が最少ではないため、反撃は不発でした。`); 
            showMessageOverlay("手札が最少ではないため、\n反撃は発動しませんでした。", 2000, () => {
                onSuccess({}); 
            });
        } 
        return;
    }


    else if (act.type === 'favorite_flower_arrival') {
        const opponents = players.filter(pl => pl.id !== p.id);
        
        showSelectionModal("対象プレイヤー選択", "カードを渡す相手を選んでください", opponents.map(pl => ({id:pl.id, name:pl.name, type:"PLAYER_SELECT"})), "card-back-pattern", 1, (selPl) => {
            const victim = players.find(v => v.id === selPl[0].id);
            
            // 演出モーダルを表示
            showPresentFlowerModal(p, victim, contextCard, () => {
                /** 2026/03/09 修正：称号「博愛主義」用のカウント **/
                if (p.id !== victim.id) {
                    matchStats.flowerGifts[p.id] = (matchStats.flowerGifts[p.id] || 0) + 1;
                }
                // 演出終了後にカードを移動
                hands[victim.id].push(contextCard);

                const currentCell = board[p.y][p.x];
                if (currentCell.stack && currentCell.stack.length > 0) {
                    const nextCard = currentCell.stack.shift();
                    currentCell.color = nextCard;
                    currentCell.revealed = nextCard.savedRevealedState || false;
                    delete nextCard.savedRevealedState;
                    currentCell.empty = false;
                } else {
                    currentCell.empty = true;
                    currentCell.revealed = false;
                    currentCell.color = null;
                    currentCell.stack = [];
                }
                
                if (typeof renderBoard === 'function') renderBoard();

                if (isNewReveal) {
                    const c = drawCard();
                    if (c) {
                        hands[p.id].push(c);
                        showCardModal(c, () => onSuccess({ preventGain: true, stayOnBoard: true }), "ドロー", p.name, "花がオープンされたため1枚ドローしました");
                    } else {
                        onSuccess({ preventGain: true, stayOnBoard: true });
                    }
                } else {
                    addLog("既に表向きであったため、ドロー効果は発動しません。");
                    onSuccess({ preventGain: true, stayOnBoard: true });
                }
            });
        }, false, null, null, null, p);
        return;
    }


    else if (act.type === 'trapped_trap_arrival') {
        const hand = hands[p.id];
        const discardCount = Math.floor(hand.length / 2);
        if (discardCount <= 0) {
            // 修正箇所：捨て札が発生しない場合の演出
            showMessageOverlay(`${p.name}の手札が少ないため、\n罠は発動しませんでした。`, 2000, () => {
                onSuccess();
            });
            return;
        }
        showSelectionModal("手札を半分捨てる", `${discardCount}枚選んで捨ててください`, hand, 
            "card-back-pattern", 
            discardCount, 
            (sel) => {
                sel.forEach(c => {
                    const idx = hands[p.id].indexOf(c);
                    if (idx !== -1) {
                        discardPile.push(hands[p.id].splice(idx, 1)[0]);
                    }
                });
                addLog(`${p.name}は罠により手札を${discardCount}枚捨てました。`);
                renderHand();
                renderDeckAndDiscard();
                onSuccess({});
            }, 
            false, // 自分でカードを見て選ぶため isBlind は false
            null, 
            null, 
            null, 
            p
        );
        return;
    }
    if (act.type === 'draw') { 
        const c = drawCard(); 
        if(c) {
            showCardModal(c, () => { 
                hands[p.id].push(c); 
                renderHand(); 
                if(onSuccess) onSuccess({}); 
            }, "ドロー", p.name, "獲得しました"); 
        } else {
            if(onSuccess) onSuccess({}); 
        }
        return; 
    }

    if (act.type === 'dash_effect') { p.extraMoves = (p.extraMoves || 0) + 1; if(onSuccess) onSuccess({}); return; }
    
    if (act.type === 'phoenix_salvage') {
    // 1. コストとして捨てられた直近のカードを取得（これは直前に discardPile に入っているはず）
    if (discardPile.length > 0) {
        const lastDiscarded = discardPile[discardPile.length - 1];
        // このカードに「フェニックス出禁」の目印をつける
        phoenixExclusionList.push(lastDiscarded);
    }

    // 2. 捨て場の「上から2番目」が、出禁リストに入っていないかチェック
    if (discardPile.length >= 2) {
        const targetIndex = discardPile.length - 2;
        const potentialTarget = discardPile[targetIndex];

        // もしそのカードが今回のコストで捨てたもの（出禁）なら、さらにその下を探すか、回収不可にする
        if (phoenixExclusionList.includes(potentialTarget)) {
            addLog("直前にコストにしたカードは回収できません（無限ループ防止）。");
            if(onSuccess) onSuccess({});
            return;
        }

        // 3. 通常の回収処理
        const salvageTarget = discardPile.splice(targetIndex, 1)[0];
        hands[p.id].push(salvageTarget);
        showCardModal(salvageTarget, () => onSuccess({}), "カード回収", p.name, "回収しました");
        addLog(`${p.name}がフェニックスの効果で「${salvageTarget.name}」を回収しました。`);
    } else {
        addLog("回収できるカードが捨て札にありませんでした。");
        if(onSuccess) onSuccess({});
    }
    return;
}

    else if (act.type === 'viridian_hand') {
        if (p.viridianUsed) { showToast("1ターンに1度のみ得られる効果です"); return; }
        const drawn = []; for(let i=0; i<2; i++) { const c = drawCard(); if(c) { c.isPublic = true; c.fromViridian = true; hands[p.id].push(c); drawn.push(c); } }
        p.viridianUsed = true; if(drawn.length > 0) { showCardModal(drawn, () => onSuccess({}), "ドロー＆公開", p.name, "使用しました"); } else { onSuccess({}); } return;
    }

    else if (act.type === 'celestia_hand') {
        const pIdx = players.indexOf(p);
        const ordered = [];
        for(let i=0; i<players.length; i++) ordered.push(players[(pIdx + i) % players.length]);
        const victims = ordered.filter(opp => opp.id !== p.id && hands[opp.id].length >= 3); 
        if (victims.length === 0) { onSuccess({}); return; }

        const processNextCelestia = (idx) => {
            if (idx >= victims.length) { onSuccess({}); return; }
            const victim = victims[idx];
            /** 2026/03/09 修正：セレスティアによる破棄ログを詳細化 **/
            showSelectionModal("CELESTIA DISCARD", `${victim.name}の手札から破棄するカードを1枚選んでください（無作為）`, hands[victim.id], "card-back-pattern", 1, (sel) => {
                const cardToDiscard = sel[0]; 
                const h = hands[victim.id]; 
                h.splice(h.indexOf(cardToDiscard), 1); 
                discardPile.push(cardToDiscard); 
                // 強調表示に変更
                addLog(`[${victim.name}] の手札から 『${cardToDiscard.name}』 が捨てられました。`);
                renderHand(); renderDeckAndDiscard(); renderStatus(); processNextCelestia(idx + 1);
            }, true, null, null, null, victim);
        };
        processNextCelestia(0); return;
    }
    else if (act.type === 'serenade_hand') {
        const lockCount = LOCK_ORDER.filter(col => collections[p.id][col.id].some(c => c.colorId !== 'white' && c.colorId !== 'black')).length;
        const canSelect = hands[p.id].filter(c => c !== activeHandCard && c.colorId !== 'white' && c.colorId !== 'black');
        showSelectionModal("セレナーデ・ロック", "ロックする手札を1枚選んでください", canSelect, "card-back-pattern", 1, (sel) => {
            const cardToLock = sel[0]; 
            if (cardToLock.colorId === 'rainbow') {
                const emptyColors = [...BASE_COLORS].reverse().filter(c => collections[p.id][c.id].length === 0);
                if (emptyColors.length === 0) { showToast("ロックできるスロットがありません"); return; }
                if (lockCount === 6) { showToast("セレナーデで最後のロック(7色目)はできません"); return; }
                showSelectionModal("セレナーデ：虹ロック", "どの色としてロックしますか？", emptyColors, "card-back-pattern", 1, (selectedColors) => {
                    const targetColor = selectedColors[0]; hands[p.id].splice(hands[p.id].indexOf(cardToLock), 1); collections[p.id][targetColor.id].push(cardToLock); p.serenadeUsed = true;
                    addLog(`${p.name}がセレナーデの効果で「${cardToLock.name}」を${targetColor.name}としてロックしました。`); renderStatus(); renderHand(); renderMyLockArea(); onSuccess({ stayOnBoard: true });
                }, false, null, null, null, p); return;
            }
            const slot = collections[p.id][cardToLock.colorId]; const isNewColor = slot.length === 0;
            if (lockCount === 6 && isNewColor) { showToast("セレナーデで最後のロック(7色目)はできません"); return; }
            if (!isNewColor) { showToast("既にその色のスロットは埋まっています"); return; }
            hands[p.id].splice(hands[p.id].indexOf(cardToLock), 1); slot.push(cardToLock); p.serenadeUsed = true;
            addLog(`${p.name}がセレナーデの効果で「${cardToLock.name}」をロックしました。`); renderStatus(); renderHand(); renderMyLockArea(); onSuccess({ stayOnBoard: true });
        }, false, null, null, null, p); return;
    }
    
    else if (act.type === 'dimension_hand') { p.dimensionActive = true; addLog(`${p.name}の通常移動が次元跳躍（2マス移動）になりました。`); updateGameState(); onSuccess({}); return; }
    
    else if (act.type === 'chotto_matta_flow') { onSuccess({ preventGain: true, followUpAction: 'chotto_matta_flow' }); return; }
    else if (act.type === 'discard_all_hand') { if (hands[p.id].length > 0) { hands[p.id].forEach(c => discardPile.push(c)); hands[p.id] = []; addLog(`${p.name}の手札がすべて破棄されました。`); } onSuccess({}); return; }
    else if (act.type === 'marmego_logic') {
        const drawn = []; let hasOrange = false;
        for(let i=0; i<4; i++) { 
            const c = drawCard(); 
            if(c) { 
                c.sealed = true; 
                c.isPublic = true; 
                hands[p.id].push(c); 
                drawn.push(c); 
                if(c.colorId === 'orange' || c.colorId === 'rainbow') hasOrange = true; 
            } 
        }
        const finish = () => { 
            if(hasOrange) { 
                // ペナルティ演出の追加
                showMessageOverlay("禁断の果実を引きました！\n全手札を破棄し、このターン移動できません。", 3000, () => {
                    addLog("禁断の果実を引きました！全ハンデス＆移動不可。"); 
                    hands[p.id].forEach(c => discardPile.push(c)); 
                    hands[p.id] = []; 
                    p.marmegoPenalty = true; 
                    onSuccess({}); 
                });
            } else {
                onSuccess({}); 
            }
        };
        if(drawn.length > 0) showCardModal(drawn, finish, "ドロー＆公開", p.name, "マルメゴを発動しました"); 
        else finish(); 
        return;
    }
    else if (act.type === 'domus_nero_logic') {
        if (p.domusNeroUsed) { showToast("1ターンに1度のみ使用可能です"); onSuccess({}); return; }
        const drawn = []; for(let i=0; i<2; i++) { const c = drawCard(); if(c) { hands[p.id].push(c); drawn.push(c); } }
        players.forEach(pl => { if(pl.id !== p.id) { const c = drawCard(); if(c) hands[pl.id].push(c); } });
        p.domusNeroUsed = true; if (drawn.length > 0) showCardModal(drawn, () => onSuccess({}), "ドロー", p.name, "ドムス-ネロを発動しました"); else onSuccess({}); return;
    }
    else if (act.type === 'konohana_logic') {
        const playerOptions = players.filter(pl => pl.id !== p.id).map(pl => ({ id: pl.id, name: pl.name, type: "PLAYER_SELECT" }));
        showSelectionModal("移動させる相手", "対象のプレイヤーを選んでください", playerOptions, "card-back-pattern", 1, (selPl) => {
            const victim = players.find(v => v.id === selPl[0].id); const adjWithCard = [];
            for(let dy=-1; dy<=1; dy++){ for(let dx=-1; dx<=1; dx++){ if(dx===0 && dy===0) continue; const nx = p.x+dx, ny = p.y+dy; if(nx>=0 && nx<GRID_SIZE && ny>=0 && ny<GRID_SIZE && !board[ny][nx].empty) adjWithCard.push({x: nx, y: ny}); } }
            if(adjWithCard.length > 0) { startSelectionMode('select_cell', 1, 'force_move_logic', "相手を移動させるマスを選択(周囲のカードがあるマス)", () => { p.konohanaPenalty = true; addLog(`${p.name}は結ばれの一本桜の効果を使用。このターン接触不可。`); onSuccess({}); }, 1, null, true, p, true, null, "おまかせ", adjWithCard, p); activeTargetPos = victim; } 
            else { addLog("周囲にカードがないため移動は発生しませんでした。"); p.konohanaPenalty = true; onSuccess({}); }
        }, false, null, null, null, p); return;
    }

    // --- greedy_palette_hand 等がある else if ブロック内 ---
    else if (act.type === 'force_hand_flow') {
    const playerOptions = players.filter(pl => pl.id !== p.id).map(pl => ({ id: pl.id, name: pl.name, type: "PLAYER_SELECT" }));
    showSelectionModal("移動させる相手", "対象のプレイヤーを選んでください", playerOptions, "card-back-pattern", 1, (selPl) => {
        const victim = players.find(v => v.id === selPl[0].id);
        
        const validCells = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = board[y][x];
                const isOccupied = players.some(pl => pl.x === x && pl.y === y);
                if (!cell.empty && !isOccupied) {
                    validCells.push({ x, y });
                }
            }
        }

        if (validCells.length > 0) {
            startSelectionMode(
                'select_cell', 1, 'force_move_logic', `${victim.name}の移動先を選択`, 
                (res) => {
                    // ここで onSuccess を呼ぶと、移動演出の前にカードが捨てられて終了してしまうため、
                    // 実際の移動完了は executeSelectionLogic 側に任せます。
                }, 
                null, null, true, p, false, null, "おまかせ", validCells, p
            );
            // ★重要：selectionState に被害者を直接保存する（これで伝言ゲームを繋ぐ）
            selectionState.targetVictim = victim;
            selectionState.originalCallback = onSuccess; // 元の終了合図を保存しておく
        } else {
            addLog("移動できる有効な空きマスがないため移動できませんでした。");
            onSuccess({});
        }
    }, false, null, null, null, p);
    return;
}

    // --- 欲しがりの吊り橋 (ID: 19) ---
    else if (act.type === 'greedy_bridge_hand') { 
        // ★ 2026/03/08 05:10 修正：善処の原則に基づく設置制限
        // 設置するマスの周囲8マスに「下に敷けるカード」が1枚も存在しないマスを除外
        const validBridgeCells = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                // 1. 自分自身の周囲（1マス以内）はルール上設置不可
                if (Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1) continue;

                // 2. そのマスの周囲8マスに「敷けるカード」があるかチェック
                let hasTargetAround = false;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                            const targetCell = board[ny][nx];
                            // カードが存在し、かつエターナル/ファースト以外（下に敷ける対象）なら有効
                            if (!targetCell.empty && targetCell.color && 
                                targetCell.color.type !== 'FIRST' && targetCell.color.type !== 'ETERNAL') {
                                hasTargetAround = true;
                                break;
                            }
                        }
                    }
                    if (hasTargetAround) break;
                }

                // 設置するマス自体のカードの有無は問わず、周囲にターゲットがあれば有効
                if (hasTargetAround) {
                    validBridgeCells.push({ x, y });
                }
            }
        }

        if (validBridgeCells.length === 0) {
            showMessageOverlay("周囲に下に敷けるカードがあるマスが\nないため、吊り橋を架けられません。", 2500);
            if (onSuccess) onSuccess({});
            return;
        }

        // 第13引数に有効なマスのリスト（validBridgeCells）を渡してハイライトを制限
        startSelectionMode('select_cell_outside', 1, 'greedy_step1', "裏向きで置くマスを選択してください（周囲以外）", (res) => {
            if (onSuccess) onSuccess({ stayOnBoard: true });
        }, null, null, true, p, false, null, "おまかせ", validBridgeCells, p); 
        return; 
    }

    else if (act.type === 'return_gate_no_open') { 
        // 1. まず足元をビリビリさせる演出（0.5秒）
        const boardEl = document.getElementById('board-grid');
        const targetEl = boardEl.children[p.y * GRID_SIZE + p.x];
        if (targetEl) targetEl.classList.add('biribiri-active');

        setTimeout(() => {
            // 2. 雷を落とす
            if (typeof triggerLightningEffect === 'function') {
                triggerLightningEffect();
            }
            if (targetEl) targetEl.classList.remove('biribiri-active');

            // --- 修正箇所：雷が落ちる時間を考慮してさらに待機してから移動と完了通知を行う ---
            setTimeout(() => {
                moveToCell(p, p.startPos.x, p.startPos.y, 'no_open', () => {
                    // ここで onSuccess を呼ぶことで、すべての演出が終わってから獲得モーダルが出る
                    onSuccess({ preventGain: false }); 
                }); 
            }, 800); // 雷の描画時間を待つための待機（800ms）

        }, 500);
        return; 
    }

    /**
 * 2026/03/08 03:20 修正
 * 1. greedy_palette_hand における showCardModal の閉じカッコ不足による構文エラーを修正。
 * 2. カード画像表示演出と、その後の色宣言フローを正確に結合。
 */

    else if (act.type === 'greedy_palette_hand') {
        isHandEffectProcessing = true;

        // ★ 2026/03/08 修正：強欲なパレット発動時にカード画像モーダルを表示
        showCardModal(contextCard || card, () => {
            // 1. 発動者が色を宣言（発動者がAIならスキップ）
            showRequestSelectionModal("色宣言", "相手が対処すべき色を選択してください", BASE_COLORS, "card-back-pattern", 1, (selCols) => {
                const declaredColor = selCols[0];
                addLog(`${p.name}が「${declaredColor.name}」を宣言！`);

                showMessageOverlay(`${p.name} の宣言：【${declaredColor.name}】\n\n相手全員はカードを渡すか、3枚捨ててください。`, 2000, () => {
                    const pIdx = players.indexOf(p);
                    const ordered = [];
                    for(let i=0; i<players.length; i++) ordered.push(players[(pIdx + i) % players.length]);
                    const opponents = ordered.filter(pl => pl.id !== p.id);

                    const processOpponentPalette = (idx) => {
                        if (idx >= opponents.length) { 
                            isHandEffectProcessing = false;
                            onSuccess({}); 
                            return; 
                        }
                        
                        const opp = opponents[idx];
                        const matchCards = (hands[opp.id] || []).filter(c => c.colorId === declaredColor.id || c.colorId === 'rainbow');
                        const handCount = (hands[opp.id] || []).length;

                        // --- [内部関数] 3枚捨てる処理 ---
                        const performDiscard3 = () => {
                            const dCount = Math.min(handCount, 3);
                            if (dCount > 0) {
                                // ★ 2026/03/08 修正：第11引数に opp を指定。
                                // これにより、相手がCPUなら自動で捨て、人間ならあなたの画面に選択が出ます。
                                showRequestSelectionModal("手札破棄", `${opp.name}: 破棄するカードを${dCount}枚選んでください`, hands[opp.id], "card-back-pattern", dCount, (sel) => {
                                    sel.forEach(c => { hands[opp.id].splice(hands[opp.id].indexOf(c), 1); discardPile.push(c); });
                                    showMessageOverlay(`${opp.name} は【手札を ${dCount} 枚破棄】しました。`, 2000, () => {
                                        addLog(`${opp.name}は手札を${dCount}枚破棄しました。`);
                                        renderHand(); renderDeckAndDiscard();
                                        setTimeout(() => processOpponentPalette(idx + 1), 1500);
                                    });
                                }, false, null, null, null, opp); // ← ここで opp を指定！
                            } else {
                                addLog(`${opp.name}は手札がないため、何も起こりませんでした。`);
                                setTimeout(() => processOpponentPalette(idx + 1), 1000);
                            }
                        };
                        // --- 対処の選択（渡す or 捨てる） ---
                        if (matchCards.length > 0) {
                            const canChooseDiscard = handCount >= 3;
                            
                            if (isAutoAction && opp.id !== 1) {
                                handleGiveCard(); 
                            } else {
                                showDetailModal(`${opp.name}の選択`, `強欲なパレット：【${declaredColor.name}】\nカードを1枚渡すか、3枚捨ててください。`, null, "カードを渡す", handleGiveCard);
                                const cnl = document.getElementById('detail-cancel-btn');
                                if (canChooseDiscard) {
                                    cnl.textContent = "3枚捨てる";
                                    cnl.style.display = "block";
                                    cnl.onclick = () => { closeDetailModal(); performDiscard3(); };
                                } else {
                                    cnl.style.display = "none";
                                }
                            }

                            function handleGiveCard() {
                                // ★ 2026/03/08 修正：ここも第11引数に opp を指定。
                                // これにより「誰がカードを渡すか」の選択権が正しく当事者に渡ります。
                                showRequestSelectionModal("譲渡カード選択", `譲渡する${declaredColor.name}のカードを選んでください`, matchCards, "card-back-pattern", 1, (selCards) => {
                                    const c = selCards[0];
                                    hands[opp.id].splice(hands[opp.id].indexOf(c), 1);
                                    hands[p.id].push(c);
                                    showMessageOverlay(`${opp.name} は ${p.name} に\n【カードを 1 枚譲渡】しました。`, 2000, () => {
                                        addLog(`${opp.name}が${p.name}に「${c.name}」を渡しました。`);
                                        renderHand();
                                        setTimeout(() => processOpponentPalette(idx + 1), 500);
                                    });
                                }, false, null, null, null, opp); // ← ここで opp を指定！
                            }
                        } else {
                            showMessageOverlay(`${opp.name} は【${declaredColor.name}】を持っていません。\n手札を3枚破棄します。`, 2500, performDiscard3);
                        }
                    };
                    processOpponentPalette(0);
                });
            }, false, null, null, null, p);
        }, "手札効果発動", p.name, "強欲なパレットを使用しました"); // ← この閉じカッコが不足していました
        return;
    }

    else if (act.type === 'colorful_hall_hand') {
        const lockCounts = players.map(pl => {
            let total = 0, targetable = 0;
            LOCK_ORDER.forEach(col => {
                const slot = collections[pl.id][col.id];
                if (slot && slot.length > 0) {
                    total += slot.length;
                    const top = slot[slot.length - 1];
                    if (top.type !== 'ETERNAL' && top.type !== 'FIRST' && top.type !== 'BOOST' && top.colorId !== 'white' && top.colorId !== 'black') {
                        targetable++;
                    }
                }
            });
            return { id: pl.id, name: pl.name, total, targetable };
        });

        const validPlayers = lockCounts.filter(l => l.targetable > 0);
        if (validPlayers.length === 0) {
            addLog("奪えるロックカードを持つプレイヤーがいないため、不発でした。");
            onSuccess({});
            return;
        }

        const maxLocks = Math.max(...validPlayers.map(l => l.total));
        const candidates = validPlayers.filter(l => l.total === maxLocks).map(l => ({ id: l.id, name: `${l.name} (${l.total}枚)`, type: "PLAYER_SELECT" }));
        
        showSelectionModal("最多ロック者選択", "ロックカードを奪う相手を選んでください", candidates, "card-back-pattern", 1, (selPl) => {
            const victim = players.find(v => v.id === selPl[0].id);
            
            showLockStealModal(p, victim, () => {
                const victimLocks = [];
                LOCK_ORDER.forEach(col => {
                    const slot = collections[victim.id][col.id];
                    if (slot && slot.length > 0) {
                        const top = slot[slot.length - 1];
                        if (top.type !== 'ETERNAL' && top.type !== 'FIRST' && top.type !== 'BOOST' && top.colorId !== 'white' && top.colorId !== 'black') {
                            victimLocks.push(top);
                        }
                    }
                });

                // ★外科手術的修正：showRequestSelectionModal を使用し、victim(被害者)を actingPlayer に指定
                showRequestSelectionModal("カード提供", `${victim.name}さん、渡すロックカードを選んでください`, victimLocks, "card-back-pattern", 1, (selCards) => {
                    const stolen = selCards[0];
                    const slot = collections[victim.id][stolen.colorId];
                    
                    // カードの物理的移動
                    slot.splice(slot.indexOf(stolen), 1);
                    hands[p.id].push(stolen);

                    /** 安全なカウントアップ処理 **/
                    if (!matchStats.lockBreakCount) matchStats.lockBreakCount = {};
                    matchStats.lockBreakCount[p.id] = (matchStats.lockBreakCount[p.id] || 0) + 1;
                    
                    addLog(`${victim.name}が「${stolen.name}」を${p.name}に渡しました。`);
                    
                    showCardModal(stolen, () => {
                        if (typeof renderHand === 'function') renderHand();
                        if (typeof renderStatus === 'function') renderStatus();
                        if (typeof renderMyLockArea === 'function') renderMyLockArea();
                        onSuccess({});
                    }, "カード獲得", p.name, "ロックカードを奪いました");
                }, false, null, null, null, victim); // victim を第11引数に渡す
            });
        }, false, null, null, null, p);
        return;
    }

    else if (act.type === 'frog_arrival') {
        const playerOrder = []; 
        // 発動者から時計回りに順序を生成
        for(let i=0; i<players.length; i++) playerOrder.push(players[(turn + i) % players.length]);

        const discardHandsSequence = (idx) => {
            if (idx >= playerOrder.length) { finishFrogTransfer(); return; }
            const currentPlayer = playerOrder[idx]; 
            const pHand = hands[currentPlayer.id] || [];

            if (pHand.length === 0) { 
                setTimeout(() => discardHandsSequence(idx + 1), 0); 
                return; 
            }

            const executeDiscard = (selectedCards) => {
                selectedCards.forEach(card => {
                    const curIdx = hands[currentPlayer.id].indexOf(card);
                    if(curIdx > -1) discardPile.push(hands[currentPlayer.id].splice(curIdx, 1)[0]);
                });
                addLog(`${currentPlayer.name}が手札をすべて破棄しました。`);
                renderHand();
                renderDeckAndDiscard();
                discardHandsSequence(idx + 1);
            };

            // ★外科手術1：showRequestSelectionModal を使用し、現在の手札所有者を指定
            showRequestSelectionModal(
                `${currentPlayer.name}の手札破棄`, 
                "破棄する順番を選択してください（全手札）", 
                pHand, 
                "card-back-pattern", 
                pHand.length, 
                (selectedOrder) => { executeDiscard(selectedOrder); }, 
                false, 
                () => { executeDiscard([...pHand]); }, 
                null, 
                null, 
                currentPlayer // 現在選ぶべきプレイヤーを渡す
            );
        };

        const finishFrogTransfer = () => {
            const lockCounts = players.map(pl => {
                let count = 0;
                LOCK_ORDER.forEach(col => {
                    const slot = collections[pl.id][col.id] || [];
                    if (slot.some(c => c.colorId !== 'white' && c.colorId !== 'black')) count++;
                });
                return { id: pl.id, name: pl.name, count: count };
            });

            const minL = Math.min(...lockCounts.map(l => l.count));
            const candidates = lockCounts.filter(l => l.count === minL);
            
            // 盤面のカード消去処理
            const currentCell = board[p.y][p.x];
            currentCell.empty = true; 
            currentCell.revealed = false; 
            currentCell.stack = []; 
            renderBoard();

            const awardFrog = (targetId) => {
                const victim = players.find(v => v.id === targetId);
                const frogCardData = CARD_DATABASE.find(c => c.id === 32);
                const frogInstance = createCardInstance(frogCardData);

                showMessageOverlay(`いろ落ちガエルをロック数が最も少ない「${victim.name}」に渡します。`, 2500, () => {
                    if (hands[victim.id]) hands[victim.id].push(frogInstance);
                    addLog(`${victim.name}がいろ落ちガエルを受け取りました。`);
                    renderHand();
                    renderStatus();
                    onSuccess({ preventGain: true, stayOnBoard: true }); 
                });
            };

            if (candidates.length === 1) {
                awardFrog(candidates[0].id);
            } else {
                const playerChoices = candidates.map(c => ({
                    id: c.id,
                    name: `${c.name} (${c.count}色)`,
                    type: "PLAYER_SELECT"
                }));

                // ★外科手術2：ここも発動者(p)が「誰に渡すか」を選ぶ際、CPUならスキップするようにする
                showRequestSelectionModal(
                    "最少ロックプレイヤー選択", 
                    "いろ落ちガエルを渡すプレイヤーを選んでください", 
                    playerChoices, 
                    "card-back-pattern", 
                    1, 
                    (selPl) => { awardFrog(selPl[0].id); }, 
                    false, 
                    () => { awardFrog(playerChoices[Math.floor(Math.random() * playerChoices.length)].id); }, 
                    null, 
                    null, 
                    p // この選択は「発動者」が行うので p を渡す
                );
            }
        };

        discardHandsSequence(0);
        return;
    }

    else if (act.type === 'frog_hand') {
        const pIdx = players.indexOf(p);
        const ordered = [];
        for(let i=0; i<players.length; i++) ordered.push(players[(pIdx + i) % players.length]);
        
        const lockCounts = players.map(pl => ({ 
            id: pl.id, 
            count: LOCK_ORDER.reduce((sum, col) => sum + collections[pl.id][col.id].filter(c => c.colorId !== 'white' && c.colorId !== 'black').length, 0) 
        }));
        const maxL = Math.max(...lockCounts.map(l => l.count)); 
        const victims = ordered.filter(pl => LOCK_ORDER.reduce((sum, col) => sum + collections[pl.id][col.id].filter(c => c.colorId !== 'white' && c.colorId !== 'black').length, 0) === maxL);

        const discardLocksSequence = (vIdx) => {
            if (vIdx >= victims.length) { 
                if (hands[p.id].length > 0) { 
                    hands[p.id].forEach(c => discardPile.push(c)); 
                    hands[p.id] = []; 
                    addLog(`${p.name}が自身の手札をすべて破棄しました。`); 
                } 
                onSuccess({}); 
                return; 
            }

            const victim = victims[vIdx]; 
            const lockedCards = [];
            LOCK_ORDER.forEach(bc => { 
                const slot = collections[victim.id][bc.id]; 
                if (slot && slot.length > 0) { 
                    const topC = slot[slot.length - 1]; 
                    if (topC.colorId === 'white' || topC.colorId === 'black' || topC.type === 'FIRST' || topC.type === 'ETERNAL' || topC.type === 'BOOST') { 
                        lockedCards.push({ ...topC, disabled: true }); 
                    } else { 
                        lockedCards.push(topC); 
                    } 
                } 
            });

            if (lockedCards.length === 0 || lockedCards.every(c => c.disabled)) { 
                discardLocksSequence(vIdx + 1); 
                return; 
            }

            // ★外科手術：showRequestSelectionModal を使用し、victim を指定
            showRequestSelectionModal(`${victim.name}のロック破棄`, "破棄するロックカードを1枚選んでください", lockedCards, "card-back-pattern", 1, (sel) => {
                const c = sel[0]; 
                collections[victim.id][c.colorId].splice(collections[victim.id][c.colorId].indexOf(c), 1); 
                discardPile.push(c); 

                /** 2026/03/09 修正：ロック破壊・奪取カウントを追加 **/
                matchStats.lockBreakCount[p.id] = (matchStats.lockBreakCount[p.id] || 0) + 1;

                addLog(`${victim.name}がロックされていた「${c.name}」を破棄しました。`); 
                // ...以下略
                
                renderStatus(); 
                renderMyLockArea(); 
                renderDeckAndDiscard(); 
                
                // 次の被害者の処理へ
                discardLocksSequence(vIdx + 1);
            }, false, null, null, null, victim); // victimを actingPlayer として渡す
        };
        
        discardLocksSequence(0); 
        return;
    }
    
    else if (act.type === 'steal_hand_logic') {
        const lockCounts = players.map(pl => ({ id: pl.id, count: LOCK_ORDER.reduce((sum, col) => sum + collections[pl.id][col.id].filter(c => c.colorId !== 'white' && c.colorId !== 'black').length, 0) }));
        const maxL = Math.max(...lockCounts.map(l => l.count)); 
        const candidates = players.filter(pl => LOCK_ORDER.reduce((sum, col) => sum + collections[pl.id][col.id].filter(c => c.colorId !== 'white' && c.colorId !== 'black').length, 0) === maxL && hands[pl.id].length > 0);
        
        if (candidates.length === 0) { 
            showMessageOverlay("対象のプレイヤーがいませんでした。", 2500, () => { addLog("対象がいなかったため不発でした。"); onSuccess({}); }); 
            return; 
        }

        const executeStealSelection = (targetId) => {
            const victim = players.find(v => v.id === targetId);

            // --- 外科手術的修正：自分を対象にした場合は不発 ---
            if (victim.id === p.id) {
                showMessageOverlay("自分を対象にしたため演出をスキップします。", 2500, () => {
                    addLog(`${p.name}は自分を対象にしました。`);
                    onSuccess({});
                });
                return;
            }
            showStealActionModal(p, victim, () => {
                showSelectionModal("強奪チャンス", `${victim.name}の手札から奪うカードを選んでください（無作為）`, hands[victim.id], "card-back-pattern", 1, (selCards) => {
                    const stolen = selCards[0]; 
                    hands[victim.id].splice(hands[victim.id].indexOf(stolen), 1); 
                    hands[p.id].push(stolen);

                    /** 2026/03/09 修正：称号「無慈悲な強奪者」「平和の使者」用のカウント **/
                    matchStats.hasContacted[p.id] = true; // 接触フラグ
                    matchStats.stolenCount[p.id] = (matchStats.stolenCount[p.id] || 0) + 1; // 強奪数
                    matchStats.matchVictimCount[victim.id] = (matchStats.matchVictimCount[victim.id] || 0) + 1; // 被害数

                    // ★外科手術的追加：奪われる側がP1(自分)なら目印を付ける
                    if (victim.id === 1) {
                    stolen.fromP1 = true;
                    }
                    
                    showCardModal(stolen, () => { 
                        addLog(`${p.name}が${victim.name}から「${stolen.name}」を奪いました。`); 
                        renderHand(); renderStatus(); onSuccess({}); 
                    }, "カード強奪", p.name, `${victim.name}から奪った`);
                }, true, null, null, null, p); 
            });
        };

        if (candidates.length === 1) executeStealSelection(candidates[0].id);
        else { 
            showSelectionModal("強奪対象選択", "カードを盗む最多ロックプレイヤーを選んでください", candidates.map(pl => ({ id: pl.id, name: `${pl.name} (${maxL}枚 / 手札${hands[pl.id].length}枚)`, type: "PLAYER_SELECT" })), "card-back-pattern", 1, (selPl) => executeStealSelection(selPl[0].id), false, null, null, null, p); 
        } 
        return;
    }

    /* --- 2026/03/11 修正：ちょっと待った！手札効果（完全版） --- */
    else if (act.type === 'chotto_matta_hand') {
        const victim = players[turn]; 
        const targetColorId = window.lastAttemptedColorId;
        
        // 1. ロックエリアからカードを物理的に抜き取る
        const slot = collections[victim.id][targetColorId];
        let targetCard = null;

        if (slot && slot.length > 0) {
            targetCard = slot.pop(); // 直近に置かれたカードを削除
            addLog(`[System] 『ちょっと待った！』により ${victim.name} の ${targetCard.name} ロックを阻止！`);
            
            // 2. 抜き取ったカードを捨て場へ
            discardCard(targetCard, victim);
            
            // 3. 相手はこのターンロック不可にする
            victim.lockPrevented = true;
            
            // 4. 画面表示を強制更新
            if (typeof renderStatus === 'function') renderStatus();
            if (typeof renderMyLockArea === 'function') renderMyLockArea();

            showMessageOverlay("ロックを阻止しました！\n相手はこのターン、ロックできません。", 2000, () => {
                // ★ ここからが重要：タイマーを戻してから「成功」を報告する
                activeTimerPlayerId = null; // 操作権をCPUに戻す
                if (typeof resumeTimer === 'function') resumeTimer();
                
                // onSuccessを実行（これであなたの「ちょっと待った」が捨て場に行き、処理が完了する）
                onSuccess({});

                // 5. 【ダメ押し】強制的にフェイズを HAND へ移行させる
                // setTimeoutを使うことで、あなたのカードが捨てられるのを待ってから動かします
                setTimeout(() => {
                    addLog(`[System] ${victim.name} のフェイズを強制移行します。`);
                    if (typeof nextPhase === 'function') {
                        // ロックフェイズは終わったものとして、強制的に次(HAND)へ
                        nextPhase(true); 
                    }
                }, 600);
            });
        } else {
            // 万が一カードがスロットに見つからない場合
            addLog(`[Error] 阻止対象のカードが見つかりませんでした。`);
            activeTimerPlayerId = null;
            onSuccess({});
        }
        return;
    }



    if (act.type === 'rich_whim_logic') {
        const pIdx = players.indexOf(p);
        const ordered = [];
        for(let i=0; i<players.length; i++) ordered.push(players[(pIdx + i) % players.length]);
        const wealthyPlayers = ordered.filter(pl => (hands[pl.id] || []).length >= 3); 
        
        if (wealthyPlayers.length === 0) { 
            showMessageOverlay("対象者がいなかったため不発でした。", 2500, () => onSuccess({})); 
            return; 
        }

        richWhimHistory = [];

        const processWhim = (idx) => {
            if (idx >= wealthyPlayers.length) {
                setTimeout(() => {
                    richWhimHistory = [];
                    renderBoard();
                    if (onSuccess) {
                        onSuccess({});
                        if (isAutoAction || isAutoProcessing) {
                            setTimeout(() => { if (typeof updateGameState === 'function') updateGameState(); }, 100);
                        }
                    }
                }, 2000); 
                return;
            }

            const wp = wealthyPlayers[idx];

            // ★外科手術1：showRequestSelectionModal に変更し、wp を指定
            showRequestSelectionModal(`${wp.name}の気まぐれ`, "盤面に置く手札を1枚選んでください", hands[wp.id], "card-back-pattern", 1, (sel) => {
                const c = sel[0]; 
                const vacantCells = board.flat().filter(cell => cell.empty);

                if (vacantCells.length > 0) {
                    hands[wp.id].splice(hands[wp.id].indexOf(c), 1); 
                    activeHandCard = c;

                    // ★ 2026/03/08 修正：操作権(actingPlayer)をwp(カード所有者)に固定
                    // 第9引数(origin)に wp を、第14引数(actingPlayer)にも wp を確実に渡します
                    /** 2026/03/10 修正：CPUが対象の場合、自動処理フラグを強制的にONにする **/
                    // カード所有者(wp)がCPU（IDが1以外）なら自動処理モードを一時的にON
                    if (wp.id !== 1) {
                        isAutoAction = true;
                    }

                    startSelectionMode(
                        'select_cell', 
                        1, 
                        'place_self_facedown_empty', 
                        `${wp.name}：置く空きマスを選んでください`, 
                        (resPos) => {
                            const pos = resPos[0];
                            richWhimHistory.push({ pos: pos, player: wp });
                            renderBoard();
                            processWhim(idx + 1);
                        }, 
                        null, null, true, wp, false, null, "おまかせ", null, wp 
                    );
                } else {
                    hands[wp.id].splice(hands[wp.id].indexOf(c), 1); 
                    discardPile.push(c);
                    addLog(`${wp.name}は置く場所がなかったためカードを捨てました。`);
                    processWhim(idx + 1);
                }
            }, false, null, null, null, wp); // ここでも wp を渡す
        };
        processWhim(0); 
        return;
    }

    else if (act.type === 'favorite_flower_hand') {
        const lockCounts = players.map(pl => LOCK_ORDER.reduce((sum, col) => sum + collections[pl.id][col.id].filter(c => c.colorId !== 'white' && c.colorId !== 'black').length, 0));
        const maxL = Math.max(...lockCounts); 
        const candidates = players.filter(pl => LOCK_ORDER.reduce((sum, col) => sum + collections[pl.id][col.id].filter(c => c.colorId !== 'white' && c.colorId !== 'black').length, 0) === maxL);
        
        showSelectionModal("対象選択", "花を贈る最多ロックプレイヤーを選んでください", candidates.map(pl => ({ id: pl.id, name: pl.name, type: "PLAYER_SELECT" })), "card-back-pattern", 1, (selPl) => {
            const target = players.find(pl => pl.id === selPl[0].id);
            
            // 周囲8マスを特定
            const adjCells = [];
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = target.x + dx, ny = target.y + dy;
                    if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                        // プレイヤーが存在しないマスのみを候補とする
                        const hasPlayer = players.some(p => p.x === nx && p.y === ny);
                        if (!hasPlayer) {
                            adjCells.push({ x: nx, y: ny });
                        }
                    }
                }
            }

            if (adjCells.length === 0) {
                showToast("配置できる空きマスが周囲にありません");
                onSuccess({});
                return;
            }

            startSelectionMode('select_cell', 1, 'place_self_revealed', `${target.name}の周囲に花を置いてください`, () => {
                const c = drawCard(); 
                if (c) { 
                    hands[p.id].push(c); 
                    showCardModal(c, () => onSuccess({ stayOnBoard: true }), "ドロー", p.name, "使用しました"); 
                } else onSuccess({ stayOnBoard: true });
            }, 1, null, true, target, true, null, "おまかせ", adjCells, p);
        }, false, null, null, null, p); 
        return;
    }

    // --- にじいろの呪い：到達/手札共通ロジック ---
    else if (act.type === 'rainbow_curse_logic') {
        const victim = p;
        const emptySlots = LOCK_ORDER.filter(col => collections[victim.id][col.id].length === 0);
        
        if (emptySlots.length > 0) {
            // ★外科手術2：被害者(victim)がスロットを選ぶ（被害者がAIならスキップ）
            showRequestSelectionModal("呪いにかかった", `${victim.name}さん、呪いを置くスロットを選んでください`, emptySlots, "card-back-pattern", 1, (slotSel) => {
                const targetCol = slotSel[0];

                // カードの実体移動処理
                const handIdx = hands[victim.id].indexOf(contextCard);
                if (handIdx !== -1) {
                    hands[victim.id].splice(handIdx, 1);
                }

                /** 2026/03/09 修正：呪われた履歴を統計に記録 **/
                collections[victim.id][targetCol.id].push(contextCard);
                addLog(`${victim.name}の${targetCol.name}が呪われた！`);

                if (!matchStats.wasCursed) matchStats.wasCursed = {};
                matchStats.wasCursed[victim.id] = true;
                
                renderStatus();
                if (onSuccess) onSuccess({ preventGain: true }); 
            }, false, null, null, null, victim); // 被害者(victim)を actingPlayer に指定
        } else {
            addLog(`空きスロットがないため、呪いは${victim.name}の手札に入った。`);
            if (onSuccess) onSuccess(); 
        }
        return;
    }

    // --- にじいろの呪い：手札効果 ---
    else if (act.type === 'rainbow_curse_hand') {
        const lockCounts = players.map(pl => ({
            id: pl.id,
            count: LOCK_ORDER.reduce((sum, col) => sum + (collections[pl.id][col.id].some(c => c.id !== 34 && c.colorId !== 'white' && c.colorId !== 'black') ? 1 : 0), 0)
        }));
        const maxL = Math.max(...lockCounts.map(l => l.count));

        const potentialVictims = players.filter(pl => {
            const myCount = LOCK_ORDER.reduce((sum, col) => sum + (collections[pl.id][col.id].some(c => c.id !== 34 && c.colorId !== 'white' && c.colorId !== 'black') ? 1 : 0), 0);
            const hasEmpty = LOCK_ORDER.some(col => collections[pl.id][col.id].length === 0);
            return myCount === maxL && hasEmpty;
        }).map(pl => ({ id: pl.id, name: pl.name, type: "PLAYER_SELECT" }));

        if (potentialVictims.length === 0) {
            onSuccess();
            return;
        }

        // ★外科手術1：呪う相手を選ぶ（発動者がAIならスキップ）
        showRequestSelectionModal("呪いの押し付け", "最多ロック者（空きあり）へ呪いを適用します", potentialVictims, "card-back-pattern", 1, (sel) => {
            const victim = players.find(pl => pl.id === sel[0].id);
            // logicへ移行
            runAction({ type: 'rainbow_curse_logic' }, victim, onSuccess, contextCard);
        }, false, null, null, null, p); // 発動者(p)を actingPlayer に指定
        return;
    }

    else { if(act.msg) addLog(act.msg); if (onSuccess) onSuccess({}); } 
    if (typeof renderBoard === 'function') renderBoard();
    if (typeof renderHand === 'function') renderHand();
    if (typeof renderStatus === 'function') renderStatus();
}

/**
 * カード粉砕エフェクト（汎用）
 */
async function triggerCardShatterEffect(x, y) {
    const boardEl = document.getElementById('board-grid');
    const targetEl = boardEl.children[y * GRID_SIZE + x];
    if (!targetEl) return;

    if (typeof playSE === 'function') playSE('se_card_shatter.mp3');

    // ★ 外科手術1：破片の数を増やしてさらに派手に（16 -> 24個）
    for (let i = 0; i < 24; i++) {
        const shard = document.createElement('div');
        shard.className = "card-shard";
        
        // ★外科手術： clip-path を少しずつランダムに変える（破片の個性を出す）
        const p1 = 40 + Math.random() * 20; // 40-60%
        const p2 = 80 + Math.random() * 20; // 80-100%
        const p3 = 10 + Math.random() * 20; // 10-30%
        const p4 = 20 + Math.random() * 20; // 20-40%
        
        shard.style.clipPath = `polygon(50% 0%, ${p1}% 40%, ${p2}% 80%, 20% ${p3}%, 0% ${p4}%)`;

        const angle = Math.random() * Math.PI * 2;
        // スローで見せるため、距離も少しだけ広げます
        const velocity = 120 + Math.random() * 180; 
        
        shard.style.setProperty('--tx', `${Math.cos(angle) * velocity}px`);
        shard.style.setProperty('--ty', `${Math.sin(angle) * velocity}px`);
        shard.style.setProperty('--tr', `${Math.random() * 1080}deg`); // 回転をさらに多めに

        targetEl.appendChild(shard);

        // ★外科手術：アニメーション時間(1.5s)に合わせて削除
        setTimeout(() => shard.remove(), 1500); 
    }

    targetEl.classList.add('cell-shake');
    setTimeout(() => targetEl.classList.remove('cell-shake'), 400);
}

async function triggerLavaRockEffect(x, y) {
    const boardEl = document.getElementById('board-grid');
    const targetEl = boardEl.children[y * GRID_SIZE + x];
    if (!targetEl) return;

    const rock = document.createElement('div');
    rock.className = "lava-bullet lava-falling";
    
    const originalOverflow = targetEl.style.overflow;
    targetEl.style.overflow = "visible";
    targetEl.appendChild(rock);

    if (typeof playSE === 'function') playSE('se_lava_impact.mp3');

    // ★ 外科手術：0.35sのアニメーションに対し、0.3sで resolve する（着弾と粉砕を重ねる）
    return new Promise(resolve => {
        setTimeout(() => {
            // 着弾の瞬間にボードを揺らす
            boardEl.classList.add('cell-shake');
            setTimeout(() => boardEl.classList.remove('cell-shake'), 300);
            
            // 溶岩球を即座に消す（粉砕エフェクトにバトンタッチ）
            rock.remove();
            targetEl.style.overflow = originalOverflow;
            resolve(); // ここでJSの制御を戻す
        }, 300); // 0.35sの終了を待たず、0.3sで次へ！
    });
}