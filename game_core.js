/**
 * 7 SHADES OF S:EVEN - game_core.js
 * 【共通定義】
 * - 到達: 表向きカードの上に駒が置かれた瞬間
 * - 到達効果: 到達時に発動。原則「効果解決」→「カード獲得」の順。
 * - 例外: カードに処遇（場に残る、破棄等）が書かれている場合はそれに従う。
 */
/**
 * 2026/02/07 13:30 修正
 * 1. 「ちょっと待った！」の到達フローをご指示の10ステップに完全準拠するよう修正。
 * 2. 再移動・カードオープン後に「ちょっと待った！」を回収し、その後に移動先の効果を解決する順序を保証。
 * 3. 効果解決前の不適切なセルクリーンアップとカード破棄を抑制し、Script Error :0:0 を解消。
 */




function createCardInstance(data) { 
    if (!data) return null;
    const baseColor = BASE_COLORS.find(c => c.id === data.colorId) || (data.colorId === 'rainbow' ? RAINBOW_COLOR : (data.colorId === 'white' ? WHITE_COLOR : BLACK_COLOR)); 
    return { 
        ...baseColor, 
        ...data, 
        colorId: data.colorId, 
        image: `images/card_${data.id}.webp`,
        stack: [], 
        baseMoveUsed: false, 
        sealed: false, 
        fromViridian: false 
    }; 
}

/* 2026/03/14 修正：カードを引いたら Firebase の山札データも更新する */
function drawCard() { 
    if (!deck || deck.length === 0) { 
        if (!discardPile || discardPile.length === 0) return null; 
        deck = [...discardPile].reverse(); 
        discardPile = []; 
        addLog("♻ 山札戻し。"); 
    } 
    const card = deck.pop();

    // オンライン戦なら、残りの山札IDリストを Firebase に送る
    if (window.MULTIPLAY.roomID && players[turn].id === window.MULTIPLAY.playerNumber) {
        const roomRef = window.MULTIPLAY.db.collection("rooms").doc(window.MULTIPLAY.roomID);
        roomRef.update({
            "deck_flat": deck.map(c => c.id),
            "lastUpdate": Date.now()
        });
    }

    if (typeof renderHand === 'function') renderHand(); 
    if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard(); // 山札の枚数表示を更新
    return card; 
}

/** 2026/03/09 修正：捨て札ログをより明確に（プレイヤー特定可能な場合は名前を出す） **/
function discardCard(card, player = null) { 
    if(!card) return;
    if(card.type !== "ETERNAL") {
        if (player) {
            addLog(`[${player.name}] が 『${card.name}』 を捨て札に送りました。`);
        } else {
            addLog(`『${card.name}』 が捨て札に送られました。`);
        }
        discardPile.push(card); 
    }
    if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard(); 
}

/**
 * 2026/03/14 修正：オンライン同期の無限ループを完全に防止
 * @param {boolean} skipFirebaseUpdate - trueの場合、Firebaseへの再報告を行わない
 */
function updateGameState(skipFirebaseUpdate = false) { 
    if (!players || players.length === 0 || !players[turn]) return;
    const p = players[turn]; 
    isStuck = false; 

    if (p.marmegoPenalty && currentPhase === PHASE.MOVE && !p.baseMoveUsed) {
        const hasOpponentInRange = players.some(opp => opp.id !== p.id && Math.abs(p.x - opp.x) + Math.abs(p.y - opp.y) === 1);
        if (!hasOpponentInRange) { 
            addLog(`${p.name}は接触対象がいないためムーブを終了します。`); 
            p.baseMoveUsed = true; 
            p.extraMoves = 0; 
            setTimeout(endTurn, 1000); 
            return; 
        }
    }

    if (currentPhase === PHASE.MOVE && !isPlacingCard) { 
        isStuck = checkStuck(p); 
        if (p.extraMoves === 0 && p.baseMoveUsed && isStuck) { 
            addLog(`${p.name}は移動不可のためターンを終了します。`); 
            setTimeout(endTurn, 800); 
            return; 
        } 
    } 

    // 各UIの描画
    if (typeof renderBoard === 'function') renderBoard(); 
    if (typeof renderStatus === 'function') renderStatus(); 
    if (typeof renderHand === 'function') renderHand(); 
    if (typeof renderMyLockArea === 'function') renderMyLockArea(); 
    if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard(); 
    if (typeof updatePhaseIndicator === 'function') updatePhaseIndicator(); 

    /* --- オンライン同期ロジック --- */
    // skipFirebaseUpdate が false の場合のみ、Firebaseへ書き込む
    if (!skipFirebaseUpdate && window.MULTIPLAY && window.MULTIPLAY.roomID) {
        const activeP = players[turn];
        const isMyTurn = (activeP && activeP.id === window.MULTIPLAY.playerNumber);
        
        // 自分が操作主であり、かつ自分のターンの時だけ「真実」を報告する
        if (isMyTurn) {
            const roomRef = window.MULTIPLAY.db.collection("rooms").doc(window.MULTIPLAY.roomID);
            roomRef.update({
                "currentTurn": turn,
                "currentPhase": currentPhase,
                "lastUpdate": Date.now()
            }).catch(e => console.error("Sync Update Error:", e));
        }
    }

    checkAutoSkip(); 
}

/**
 * 2026/03/12 修正：割り込み確認
 * 強欲なパレット(ID:33)を持っていても、相手全員が手札0枚なら割り込み確認を出さないように制限。
 */
function checkAnytimeReactions(onProceed) {
    if (!players || players.length === 0) { onProceed(); return; }
    
    const candidates = players.filter(pl => {
        if (pl.reactionSkip || !hands[pl.id]) return false;
        // パレット(ID:33)を持っているか
        const hasPalette = hands[pl.id].some(c => c.id === 33 && !c.sealed);
        if (!hasPalette) return false;
        
        // パレットを持っていても、自分以外の相手全員が手札0なら割り込み対象にしない
        const hasTarget = players.some(target => target.id !== pl.id && (hands[target.id] || []).length > 0);
        return hasTarget;
    });

    if (candidates.length === 0) { onProceed(); return; }
    
    let pIdx = 0;
    const processNext = () => {
        if (pIdx >= candidates.length) { 
            // 全員の確認が終わったらタイマーを再開
            if (typeof resumeTimer === 'function') resumeTimer();
            onProceed(); 
            return; 
        }

        const pl = candidates[pIdx]; 
        
        // 人間（P1）が候補にいる場合、タイマーを一時停止
        if (pl.id === 1 && typeof pauseTimer === 'function') {
            pauseTimer(); 
        }

        const anytimeCards = (hands[pl.id] || []).filter(c => c.id === 33 && !c.sealed);
        if (anytimeCards.length === 0) { 
            pIdx++; 
            processNext(); 
            return; 
        }
        
        const firstCard = anytimeCards[0];
        
        if (typeof showDetailModal === 'function') {
            // ★ 外科手術：CPU（P2〜P4）の場合の思考ルーチン
            if (pl.id !== 1) {
                // AIに判断させる（NORMALモードなら状況に応じて、EASYなら確率で）
                let shouldInterrupt = false;
                if (autoMode === 'NORMAL') {
                    // 戦略的判断：相手がゴールに極めて近い、または自分が逆転を狙える時
                    const enemyNearGate = players.some(opp => {
                        const dist = Math.min(...players.filter(p => p.id !== opp.id).map(eg => getDistance({x: opp.x, y: opp.y}, eg.startPos)));
                        return dist <= 1; // 誰かがゴール直前なら割込！
                    });
                    shouldInterrupt = enemyNearGate || (Math.random() > 0.7); // 30%の確率、または危機的状況で発動
                } else {
                    shouldInterrupt = (Math.random() > 0.8); // EASYは20%の確率で気まぐれに発動
                }

                if (shouldInterrupt) {
                    addLog(`[Interrupt] ${pl.name} が「強欲なパレット」で割り込みます！`);
                    // モーダルを出さずに「使用する」の中身を直接実行
                    activeHandCard = firstCard; 
                    executeCardEffect(firstCard.handEffect, pl, () => {
                        const curIdx = hands[pl.id].indexOf(firstCard); 
                        if (curIdx > -1) discardPile.push(hands[pl.id].splice(curIdx, 1)[0]);
                        renderHand(); renderStatus(); updateGameState(); 
                        pIdx++; processNext();
                    }, firstCard);
                } else {
                    // パスする場合
                    pIdx++;
                    processNext();
                }
                return; // CPUはこのブロックで完結させる（画面を出さない）
            }

            // モーダルを表示
            showDetailModal("割込確認", `${pl.name}さん、「強欲なパレット」を使用しますか？`, anytimeCards.length === 1 ? firstCard : null, "使用する", () => {
                if (anytimeCards.length === 1) {
                    activeHandCard = firstCard; 
                    if (typeof executeCardEffect === 'function') {
                        executeCardEffect(firstCard.handEffect, pl, () => {
                            const curIdx = hands[pl.id].indexOf(firstCard); 
                            if (curIdx > -1) discardPile.push(hands[pl.id].splice(curIdx, 1)[0]);
                            renderHand(); renderStatus(); updateGameState(); 
                            pIdx++; // 次の候補へ
                            processNext();
                        }, firstCard);
                    }
                } else {
                    if (typeof showSelectionModal === 'function') {
                        showSelectionModal("発動カード選択", "使用するカードを選んでください", anytimeCards, "card-back-pattern", 1, (sel) => {
                            const card = sel[0]; 
                            activeHandCard = card; 
                            executeCardEffect(card.handEffect, pl, () => {
                                const curIdx = hands[pl.id].indexOf(card); 
                                if (curIdx > -1) discardPile.push(hands[pl.id].splice(curIdx, 1)[0]);
                                renderHand(); renderStatus(); updateGameState(); 
                                pIdx++; // 次の候補へ
                                processNext();
                            }, card);
                        }, false, null, null, null, pl);
                    }
                }
            });

            // キャンセルボタン（パス）の挙動を上書き
            const cnl = document.getElementById('detail-cancel-btn'); 
            const okBtn = document.getElementById('detail-ok-btn'); // 「使用する」ボタン

            if(cnl && okBtn) { 
                // 1. ボタンの親要素（コンテナ）を Flexbox の折り返し設定にする
                const btnContainer = cnl.parentNode;
                btnContainer.className = "flex flex-wrap justify-center gap-2 mt-4"; 

                // 2. 既存ボタンのサイズ調整（「パス」と「使用する」を横並びに）
                cnl.textContent = "パス";
                cnl.className = "flex-1 min-w-[80px] py-2 text-xs bg-gray-700 border border-gray-500 rounded text-white";
                
                okBtn.className = "flex-1 min-w-[80px] py-2 text-xs bg-blue-600 border border-blue-400 rounded text-white font-bold";

                // 3. 「反応スルー」ボタンの生成と配置
                // すでにボタンがある場合は一旦削除（重複防止）
                const oldSkip = document.getElementById('detail-skip-all-btn');
                if(oldSkip) oldSkip.remove();

                const skipBtn = document.createElement('button');
                skipBtn.id = "detail-skip-all-btn";
                skipBtn.textContent = "今後の反応をスルー";
                // w-full で下に1行で配置、文字をさらに小さく
                skipBtn.className = "w-full py-1.5 text-[10px] bg-red-900/40 border border-red-700/50 rounded text-red-200 mt-1 opacity-80 hover:opacity-100 transition-opacity";
                
                // コンテナの最後に追加することで、下に配置される
                btnContainer.appendChild(skipBtn);

                // 各ボタンのクリックイベント
                cnl.onclick = () => { 
                    closeDetailModal(); 
                    pIdx++; 
                    processNext(); 
                };

                skipBtn.onclick = () => {
                    addLog(`${pl.name} は今後の反応をスルー設定にしました。`);
                    pl.reactionSkip = true; 
                    closeDetailModal();
                    pIdx++;
                    processNext();
                };
            }
        } else {
            // モーダル関数がない場合は次へ
            pIdx++;
            processNext();
        }
    };
    processNext();
}

function toggleReactionSkip() {
    if (!players || !players[turn]) return;
    const p = players[turn];
    p.reactionSkip = !p.reactionSkip;
    addLog(`反応スルーを ${p.reactionSkip ? 'ON' : 'OFF'} に設定しました。`);
    if (typeof updateGameState === 'function') updateGameState();
}


/**
 * 2026/03/12 修正：startTurn
 * CPUがロックフェイズ開始時に停止する現象を回避するため、
 * ターンの冒頭で全ての進行管理フラグを安全な状態にリセットします。
 */
async function startTurn() { 
    if (!players || players.length === 0) return;
    
    /* 2026/03/15 修正：演出待ちによるフリーズを防ぐため、フラグ掃除を最優先に */
    isEndingTurn = false; 
    isProcessingMove = false; 
    isHandEffectProcessing = false;
    isAutoProcessing = false;
    activeModalId = null;
    if (typeof activeTimerPlayerId !== 'undefined') activeTimerPlayerId = null;

    const p = players[turn]; 
    if(!p) return;

    // 変数リセット
    p.baseMoveUsed = false; 
    p.viridianUsed = false; 
    p.dimensionActive = false; 
    p.lockPrevented = false; 
    p.domusNeroUsed = false; 
    p.marmegoPenalty = false; 
    p.konohanaPenalty = false;
    
    // 手札の封印解除
    players.forEach(pl => { if (hands[pl.id]) { hands[pl.id].forEach(c => { c.sealed = false; }); } });

    // 演出（通知）を実行。
    // オフライン戦では await を外して非同期にすることで、
    // 演出中に次の処理（AIの思考など）の準備が進むようにします。
    if (typeof showTurnChangeNotification === 'function') {
        showTurnChangeNotification(p); 
    }

    currentPhase = PHASE.LOCK; 
    isStuck = false; 
    isPlacingCard = false; 
    isPeekingMode = false; 

    // 自動化判定
    const isForcedCpu = (typeof window.FORCED_CPU_MODE !== 'undefined' && window.FORCED_CPU_MODE);
    if (window.MULTIPLAY && window.MULTIPLAY.roomID) {
        isAutoAction = false;
    } else if (isForcedCpu) {
        isAutoAction = true;
    } else {
        isAutoAction = (p.id !== 1);
    }

    resetTimer(); 
    updateGameState(); 
}

/**
 * 2026/03/17 修正
 * ターン切り替え演出が完全に終了するまで、startTurn（およびタイマー開始）を待機させるよう非同期化。
 */
async function nextTurn() { 
    if (!players || players.length === 0) return;

    // ★追加：次の人へ回る前に、現在の盤面状況を記録
    if (typeof recordLockHistory === 'function') recordLockHistory();

    turn = (turn + 1) % players.length; 
    
    if (typeof totalTurnCount !== 'undefined') {
        totalTurnCount++;
    }
    
    usedOnceEffectsThisTurn = []; 
    phoenixExclusionList = [];    

    // --- 外科手術：ターン開始演出を await で待機する ---
    if (typeof showTurnChangeNotification === 'function') {
        // 演出が表示され、閉じきるまでここで処理が一時停止します
        await showTurnChangeNotification(players[turn]);
    }

    // 演出が終わってから、実際のターン処理（フェイズ開始・タイマー起動）を開始
    startTurn(); 
}

let isPhaseTransitioning = false; // 【追加】二重移行防止フラグ

function nextPhase(isForced = false) { 
    if (isPeekingMode || isPhaseTransitioning) return; 
    isPhaseTransitioning = true; 

    // 【外科手術的追加】フェイズ移行時もタイマー固定を解除
    activeTimerPlayerId = null;
    
    if (useGlobalTimer && !isForced) {
        const p = players[turn];
        const maxTimeSetting = parseInt(document.getElementById('setting-max-time')?.value || "180");
        
        if (p && timeLeft > 0) {
            const charge = timeLeft; 
            p.totalTimeLeft = Math.min(maxTimeSetting, p.totalTimeLeft + charge);
            addLog(`💰 ${p.name}: ${charge}秒を全額貯金しました。`);
        }
    }

    checkAnytimeReactions(() => {
        const p = players[turn];
        const now = new Date();
        const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        let phaseName = "";
        if (currentPhase === PHASE.LOCK) { 
            currentPhase = PHASE.HAND; 
            phaseName = "HAND";
        }
        else if (currentPhase === PHASE.HAND) { 
            currentPhase = PHASE.MOVE; 
            phaseName = "MOVE";
        } 
        else if (currentPhase === PHASE.MOVE && isForced) { 
            isPhaseTransitioning = false; 
            endTurn(); return; 
        } 

        // 通常のログ
        addLog(`<span class="text-indigo-400 font-bold italic">⏳ [PHASE] ${phaseName}</span>`); 
        
        // 1.【追加：提案1】詳細なデバッグログ（観戦・テストモードのみ画面に表示）
        addLog(`[DEBUG] ${timeStr} | Player: ${p.name} | Phase: ${phaseName} 開始`, true);
        
        /** 2026/03/04 22:15 修正：フェイズ移行時に最新の補充時間設定を反映 **/
        isHandEffectProcessing = false; 
        isAutoAction = false; 
        isPlacingCard = false;

        /* 2026/03/14 修正：動くのがCPU（または観戦モード）なら補充時間を1秒に短縮 */
        const isForcedCpu = (typeof window.FORCED_CPU_MODE !== 'undefined' && window.FORCED_CPU_MODE);
        const isCurrentPlayerCpu = (p.id !== 1); // 今の手番が人間(P1)ではない

        if (isForcedCpu || isCurrentPlayerCpu) {
            // 観戦モード、またはCPUの手番なら爆速進行（1秒）
            window.currentPhaseMaxTime = 1; 
        } else {
            // 人間(P1)の手番なら、設定画面で決めた秒数（デフォルト15秒）を補充
            const pTimeEl = document.getElementById('setting-phase-time');
            window.currentPhaseMaxTime = pTimeEl ? parseInt(pTimeEl.value) : 15;
        }

        resetTimer(); 
        updateGameState(); 

        // 0.5秒後にフラグを解除。これにより、補充時間0秒でも
        // タイマーの「次の1秒」が来るまで次の強制移行を受け付けないようにします。
        setTimeout(() => { isPhaseTransitioning = false; }, 500);
    });
}

function endTurn() { 
    if (isEndingTurn || !players || !players[turn]) return; 
    const p = players[turn]; 

    /* --- 1. オンライン戦（マルチプレイ）のルート --- */
    if (window.MULTIPLAY && window.MULTIPLAY.roomID) {
        if (p.id === window.MULTIPLAY.playerNumber) {
            isEndingTurn = true; 
            const nextTurn = (turn + 1) % players.length;
            const roomRef = window.MULTIPLAY.db.collection("rooms").doc(window.MULTIPLAY.roomID);
            
            roomRef.update({
                "currentTurn": nextTurn,
                "currentPhase": PHASE.LOCK,
                "lastUpdate": Date.now(),
                "lastMove": firebase.firestore.FieldValue.delete(),
                "lastCardEffect": firebase.firestore.FieldValue.delete()
            }).then(() => {
                addLog(`[Online] ターン終了を同期。次は ${players[nextTurn].name}`);
            });
            
            // ヴァーディアン等の後処理
            if (p.viridianUsed && hands[p.id]) {
                hands[p.id] = hands[p.id].filter(c => {
                    if (c.fromViridian) { discardPile.push(c); return false; }
                    return true;
                });
            }
            if(timerInterval) { clearInterval(timerInterval); timerInterval = null; } 
            return; // Firebaseからの通知を待つため、ここで終了
        } else {
            return; // 自分以外の番の時は何もしない
        }
    }

    /* --- 2. オフライン戦（CPU戦・1人テスト）のルート --- */
    isEndingTurn = true; // 通行止め開始
    if(timerInterval) { clearInterval(timerInterval); timerInterval = null; } 
    
    // ヴァーディアンの後処理
    if (p.viridianUsed && hands[p.id]) { 
        const toDiscard = hands[p.id].filter(c => c.fromViridian); 
        if (toDiscard.length > 0) { 
            toDiscard.forEach(c => { 
                const idx = hands[p.id].indexOf(c); 
                if (idx > -1) discardPile.push(hands[p.id].splice(idx, 1)[0]); 
            }); 
            addLog(`${p.name}はヴァーディアンで引いたカードを捨てました。`); 
        } 
    }
    
    // ゲート侵攻チェック
    if (typeof checkGateInvasionForAll === 'function') {
        checkGateInvasionForAll(); 
    } else {
        // 侵攻チェックがない場合のフォールバック
        const nextT = (turn + 1) % players.length;
        turn = nextT;
        startTurn();
    }
    
    isProcessingMove = false; 
}

/* 2026/03/14 修正：タイマー加速防止と変数エラー防止を一本化 */
function resetTimer() {
    // 1. 既存タイマーを完全に停止
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null; 
    }
    
    /* 2026/03/15 修正：人間・CPU・オンラインを判別してタイマー秒数をセット */
    const p = players[turn];
    let maxTime = window.currentPhaseMaxTime || 15;

    // 1. オンライン対戦中か判定
    const isOnline = !!(window.MULTIPLAY && window.MULTIPLAY.roomID);

    if (isOnline) {
        // オンライン戦：誰の番であっても設定された時間（15秒等）をセット
        // ※相手の番の時もタイマーを表示させるため
        maxTime = window.currentPhaseMaxTime || 15;
    } else {
        // オフライン戦（通常CPU戦）：
        if (p && p.id !== 1) {
            // CPUの番なら、ロックフェイズ等は爆速（1秒）にする
            maxTime = (currentPhase === PHASE.LOCK) ? 1 : 2;
        } else {
            // 人間（P1）の番なら設定通り
            maxTime = window.currentPhaseMaxTime || 15;
        }
    }

    timeLeft = maxTime;
    
    if (p) {
        timeAtTurnStart = p.totalTimeLeft;
    }

    // 3. タイマーを1つだけ再起動
    timerInterval = setInterval(() => {
        if (typeof updateTimerTick === 'function') {
            updateTimerTick();
        }
    }, 1000);
}

/**
 * 2026/03/11 修正
 * 1. タイムアウト時の自動ロック処理を handleHandClick 経由に変更し、割り込み検問を有効化。
 * 2. 構文エラー（カッコの不整合）を解消。
 */
function updateTimerTick() { 
    if(winner || isTimerPaused) return;

    const selectionModal = document.getElementById('selection-modal');
    const isSelectionActive = selectionState.active || (selectionModal && !selectionModal.classList.contains('hidden'));

    if (!isSelectionActive) {
        if (isAutoProcessing || isHandEffectProcessing || isProcessingMove || activeModalId) return;
    }

    const p = activeTimerPlayerId 
        ? players.find(pl => pl.id === activeTimerPlayerId) 
        : players[turn];
        
    if (!p) return;

    const ignoreP1 = document.getElementById('setting-p1-timer-ignore')?.checked;
    if (ignoreP1 && p.id === 1) { 
        return; 
    }

    if (timeLeft > 0) {
        timeLeft--; 
    } else if (useGlobalTimer && p.totalTimeLeft > 0) {
        p.totalTimeLeft--; 
    } else {
        if (isAutoProcessing) {
            // 自動処理中なのにタイマーが0になった場合の警告（スタックの兆候）
            addLog(`[DEBUG] タイムアウト警告: 自動処理フラグが残ったままです`, true);
            return;
        }
        
        /* 2026/03/15 修正：オンライン戦では「自分の番」以外のタイムアウト自動処理を禁止 */
        if (window.MULTIPLAY && window.MULTIPLAY.roomID) {
            const isMyTurn = (p.id === window.MULTIPLAY.playerNumber);
            if (!isMyTurn) {
                // 相手の番なら、自分側では何もしない（相手の処理が届くのを待つ）
                return;
            }
        }
        
        addLog(`[DEBUG] タイムアウト発生: ${p.name} の自動実行を要請`, true);

        if (currentPhase === PHASE.LOCK) {
            const autoLock = document.getElementById('setting-timeout-random-lock')?.checked;
            const pHand = hands[p.id] || [];
            if (autoLock && pHand.length > 0) {
                isAutoProcessing = true; 

                let lockableCards = pHand.filter(card => {
                    const col = card.colorId;
                    if (col === 'white' || col === 'black' || col === 'rainbow') return false;
                    return collections[p.id][col].length === 0;
                });

                let targetCard = null;
                if (lockableCards.length > 0) {
                    if (autoMode === 'NORMAL') {
                        const colorCounts = {};
                        lockableCards.forEach(card => {
                            colorCounts[card.colorId] = (colorCounts[card.colorId] || 0) + 1;
                        });
                        const minCount = Math.min(...Object.values(colorCounts));
                        const rarestColorIds = Object.keys(colorCounts).filter(id => colorCounts[id] === minCount);
                        const targetColorId = rarestColorIds[Math.floor(Math.random() * rarestColorIds.length)];
                        targetCard = lockableCards.find(card => card.colorId === targetColorId);
                    } else {
                        targetCard = lockableCards[Math.floor(Math.random() * lockableCards.length)];
                    }
                }

                if (targetCard) {
                    // ★ 修正：直接ロックせず、検問所を通る handleHandClick へ
                    const targetIdx = hands[p.id].indexOf(targetCard);
                    addLog(`[System] ${p.name}のタイムアウト：自動ロックを試みます...`);
                    isAutoAction = true;
                    handleHandClick(targetIdx);
                    return; // ここで一旦終了（handleHandClick 側で検問が始まる）
                }
                isAutoProcessing = false;
            }
        }
        
        if (currentPhase === PHASE.HAND) {
            const autoHand = document.getElementById('setting-timeout-auto-hand')?.checked;
            if (autoHand) {
                /* 2026/03/12 修正：他人のハンドフェイズ中にAIが勝手にカードを使わないようガード */
                const currentPlayer = players[turn];
                if (p.id !== currentPlayer.id) {
                    // 自分（p）が手番プレイヤーではない場合、
                    // パレットのような特殊割り込み以外で勝手にAI思考を走らせない
                    return; 
                }

                if (isAutoProcessing || isHandEffectProcessing || isSelectionActive || activeModalId) {
                    handleTimeOut(); return;
                }

                const lockCards = [];
                LOCK_ORDER.forEach(color => {
                    const slot = collections[p.id][color.id];
                    if (slot && slot.length > 0) {
                        const topC = slot[slot.length - 1];
                        if (topC.type === "FIRST" || topC.type === "ETERNAL") {
                            lockCards.push(topC);
                        }
                    }
                });

                const allCandidates = [...hands[p.id], ...lockCards];
                const usable = allCandidates.filter(c => {
                    if (!canPlayHandEffect(c, p)) return false;
                    if (autoMode === 'NORMAL') {
                        if (c.fromViridian) return true;
                        const col = c.colorId;
                        const isBasicColor = ['red', 'orange', 'yellow', 'green', 'blue', 'pink', 'purple'].includes(col);
                        if (isBasicColor) {
                            const slot = collections[p.id][col];
                            const isNotLocked = !slot || slot.length === 0 || (slot.length === 1 && slot[0].id === 34);
                            if (isNotLocked) return false; 
                        }
                        const harmfulAgainstTop = [30, 32, 34];
                        if (harmfulAgainstTop.includes(c.id)) {
                            const lockCounts = players.map(pl => {
                                return LOCK_ORDER.filter(colorBase => {
                                    const s = collections[pl.id][colorBase.id];
                                    return s && s.length > 0 && !s.some(card => card.id === 34);
                                }).length;
                            });
                            const maxLocks = Math.max(...lockCounts);
                            const myLocks = lockCounts[players.indexOf(p)];
                            if (myLocks === maxLocks) return false;
                        }
                    }
                    return true;
                });

                // 2026/03/11 修正：なないろの欠片の温存をAIの優先順位に反映
                if (usable.length > 0) {
                    // 1. ヴァーディアン由来(fromViridian)を最優先
                    // 2. なないろの欠片(ID:29)かつ温存条件に該当するものは最後順位にする
                    usable.sort((a, b) => {
                        if (b.fromViridian !== a.fromViridian) return (b.fromViridian ? 1 : -1);
                        
                        // ID:29 の温存ロジックをここにも適用
                        const isAFragment = (a.id === 29);
                        const isBFragment = (b.id === 29);
                        if (isAFragment !== isBFragment) return (isAFragment ? 1 : -1); // 欠片を後ろに
                        
                        return 0;
                    });
                    
                    const targetCard = usable[0];

                    // ★最終チェック：もし選ばれたのが「温存すべき欠片」なら、結局使わない
                    if (targetCard.id === 29 && !canPlayHandEffect(targetCard, p)) {
                        isAutoAction = false;
                        isAutoProcessing = false;
                        handleTimeOut(); // 次の処理（フェイズ移行等）へ
                        return;
                    }

                    isAutoProcessing = true; 
                    isAutoAction = true; 
                    const handIdx = hands[p.id].indexOf(targetCard);
                    if (handIdx !== -1) handleHandClick(handIdx);
                    else handleHandClick(-1, targetCard);
                    return;
                }
                isAutoAction = false;
            }
        }
        handleTimeOut(); 
        return;
    }

    if (typeof updateTimerVisual === 'function') updateTimerVisual(); 
}

function handleTimeOut() { 
    if (window.MULTIPLAY.roomID) return; // オンライン時はタイムアウトで勝手に動かさない
    if (isEndingTurn || winner) return; 


    const selectionModal = document.getElementById('selection-modal');
    const arrivalModal = document.getElementById('arrival-modal');
    const stealActionModal = document.getElementById('steal-action-modal');
    /* 2026/03/14 修正：オンライン対戦時のVIPガードを「自分」に適用 */
    const myID = window.MULTIPLAY.playerNumber || 1;
    const detailModal = document.getElementById('detail-modal');
    
    if (detailModal && !detailModal.classList.contains('hidden')) {
        const title = document.getElementById('detail-title')?.textContent;
        // 「割込確認」が出ていて、それが「自分」の番なら自動処理しない（相手の番なら自動で進める）
        if (title === "割込確認" && actingP && actingP.id === myID) {
            return; 
        }
    }

    // 現在の実行対象プレイヤー（相手プレイヤーを含む）を特定
    const actingP = activeTimerPlayerId 
        ? players.find(pl => pl.id === activeTimerPlayerId) 
        : players[turn];

    // 選択画面（盤面マス選択 または カード等のアイテム選択）が出ているか判定
    const isSelectionActive = selectionState.active || (selectionModal && !selectionModal.classList.contains('hidden'));

    // 1. 【最優先】スティールなどの演出用モーダルをスキップ
    if (stealActionModal && !stealActionModal.classList.contains('hidden')) {
        addLog(`> タイムアウト：${actingP.name}が演出をスキップします`);
        stealActionModal.click(); 
        return;
    }

    // 2. ガード条件（選択待ちでない場合のみ、他の処理が終わるのを待つ）
    if (!isSelectionActive) {
        if (isAutoProcessing || isHandEffectProcessing || isProcessingMove || (invasionQueue && invasionQueue.length > 0) || activeModalId) {
            if (autoProcessTimeout) clearTimeout(autoProcessTimeout);
            autoProcessTimeout = setTimeout(handleTimeOut, 500); 
            return;
        }
    }

    // ここまで来たら自動アクション実行
    isAutoAction = true;
    addLog(`> タイムアウト：${actingP.name}の自動処理を開始します`);

    // 3. 選択待ちモーダル（強奪チャンス、気まぐれ配置、エターナル獲得等）への対応
    if (isSelectionActive) {
        const okBtn = document.getElementById('selection-ok-btn');
        const resArea = document.getElementById('selection-result');

        // A. 既に決定画面（結果確認）ならOKボタンを押す
        if (okBtn && resArea && !resArea.classList.contains('hidden')) {
            okBtn.click();
            return;
        }

        // B. カード選択モーダル内の選択肢（selection-option）がある場合
        if (selectionModal && !selectionModal.classList.contains('hidden')) {
            const options = Array.from(document.querySelectorAll('.selection-option'));
            // まだ選択されていない（光っていない）選択肢を抽出
            const unselected = options.filter(opt => !opt.classList.contains('selected-card-glow'));
            if (unselected.length > 0) {
                // ランダムに1つ選んでクリック（複数枚選択が必要な場合も、毎秒クリックされることで解決）
                unselected[Math.floor(Math.random() * unselected.length)].click();
                return;
            }
        }

        // C. 盤面マス選択モード（selectionState）が有効ならそちらを実行
        if (selectionState.active) {
            triggerAutoSelect();
        }
        return;
    }

    // 4. 到達獲得・ドロー確認・詳細確認を閉じる
    if (arrivalModal && !arrivalModal.classList.contains('hidden')) { 
        const btn = document.getElementById('arrival-ok-btn');
        if (btn) { 
            addLog(`[DEBUG] 到達確認: ${actingP.name}のボタンを代行クリック`, true); // true を渡すとデバッグ扱い
            btn.click(); 
            return; 
        } 
    }

    if (detailModal && !detailModal.classList.contains('hidden')) { 
        const btn = document.getElementById('detail-ok-btn');
        if (btn && !btn.disabled) {
            addLog(`[DEBUG] 確認実行: ${actingP.name}のボタンを代行クリック`, true);
            btn.click(); 
            return; 
        } 
    }
    
    // 5. フェイズ進行の自動化
    if (isProcessingMove || isHandEffectProcessing) return; 
    if(timerInterval) { clearInterval(timerInterval); timerInterval = null; } 
    
    if (currentPhase === PHASE.MOVE) { 
        if (isStuck) autoPlace(players[turn]); 
        else autoMove(players[turn]); 
    } else { 
        if (isAutoProcessing) return; 
        nextPhase(true); 
    }
}

/**
 * 2026/03/03 修正
 * autoMove内の評価ロジックを AI_SCORE_CONFIG 連動型にアップデート
 */
/**
 * 2026/03/12 修正：autoMove
 * AIがタイムバー満タンで停止する現象を回避するため、
 * 思考開始の直前で移動・効果処理フラグを強制的にクリーンアップします。
 */
function autoMove(p) { 
    if (!p || !players) return;

    // 演出の残存等でフラグがロックされている場合があるため、AI思考時はこれらを強制解除して進行させる
    if (isProcessingMove || isHandEffectProcessing) {
        console.log(`[AI Fix] ${p.name}の行動を妨げているフラグを強制リセットしました。`);
        isProcessingMove = false;
        isHandEffectProcessing = false;
    }

    const enemyGatePos = players.filter(pl => pl.id !== p.id).map(pl => pl.startPos); 
    const otherPlayers = players.filter(pl => pl.id !== p.id);
    
    const moveRange = (p.dimensionActive && !p.baseMoveUsed) ? 2 : 1;
    const directions = [[0, 0], [0, moveRange], [0, -moveRange], [moveRange, 0], [-moveRange, 0]]; 
    
    // ★外科手術1：欠落していたスコア設定の補完（MOVE_TOWARD_GATE を追加）
    const cfg = window.AI_SCORE_CONFIG || {
        CARD_COUNT: 10, UNLOCKED_COLOR: 50, ADJACENT_ENEMY: 5,
        SELF_GATE_DEFENSE: 20, APPROACH_ENEMY_GATE: 20, REACH_ENEMY_GATE: 100,
        MOVE_TOWARD_GATE: 30, // ←ここが抜けていたため NaN になっていた可能性が高い
        RARE_COLOR: 20, POWER_CARD_NEAR: 20, STEAL_ACTION: 50,
        STACK_COUNT: 10 // これも追加
    };

    let bestMoves = [];
    let maxScore = -Infinity;

    // ★念のため：autoMode が未定義なら NORMAL に強制設定（テストモード対策）
    const currentAutoMode = (typeof autoMode !== 'undefined') ? autoMode : 'NORMAL';

    for (let d of directions) { 
        const nx = p.x + d[0], ny = p.y + d[1]; 
        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

        const isStaying = (d[0] === 0 && d[1] === 0);
        if (!isStaying && !(p.extraMoves > 0) && nx === p.startPos.x && ny === p.startPos.y) {
            continue;
        }

        const cell = board[ny][nx];
        const epOn = otherPlayers.find(ep => ep.x === nx && ep.y === ny);
        const isSelectable = isStaying || !cell.empty || epOn;

        if (isSelectable) { 
            let score = 0;
            if (currentAutoMode === 'NORMAL') {
                try {
                    const currentDistToGate = Math.min(...enemyGatePos.map(eg => getDistance({x: p.x, y: p.y}, eg)));
                    const nextDistToGate = Math.min(...enemyGatePos.map(eg => getDistance({x: nx, y: ny}, eg)));

                    if (nextDistToGate === 0 && currentDistToGate <= 1) score += (cfg.REACH_ENEMY_GATE || 100);
                    if (nextDistToGate < currentDistToGate) score += (cfg.MOVE_TOWARD_GATE || 30);

                    /* --- 2026/03/11 修正：隣接回避ロジック（反撃不保持時） --- */
                    const p1 = players.find(pl => pl.id === 1);
                    if (p1) {
                        const distToP1 = Math.abs(nx - p1.x) + Math.abs(ny - p1.y);
                        if (distToP1 === 1) {
                            // 手札に「反撃(ID:22)」があるか確認
                            const hasCounter = hands[p.id] && hands[p.id].some(c => c.id === 22);
                            if (!hasCounter) {
                                // 反撃がない場合、80%の確率でそのマスの評価を大幅に下げる（避ける）
                                if (Math.random() < 0.8) {
                                    score -= 200; 
                                }
                            }
                        }
                    }
                    /* ----------------------------------------------------- */

                    if (epOn) score += (cfg.STEAL_ACTION || 50);

                    if (!cell.empty && cell.revealed && cell.color) {
                        const colId = cell.color.colorId;
                        if (cell.color.isNegativeArrival) score -= 80;
                        if (collections[p.id][colId] && collections[p.id][colId].length === 0) score += (cfg.UNLOCKED_COLOR || 50);
                        if (['rainbow', 'white', 'black'].includes(colId)) score += (cfg.RARE_COLOR || 20);
                    }
                    
                    /* --- 2026/03/11 修正：未来の機動力評価（袋小路回避） --- */
                    const stackCount = (cell.stack ? cell.stack.length : 0) + (cell.empty ? 0 : 1);
                    score += Math.max(1, stackCount * (cfg.STACK_COUNT || cfg.CARD_COUNT || 10));

                    // 移動候補地(nx, ny)に止まったと仮定して、そこからさらに動けるマスの数を調べる
                    let futureMobility = 0;
                    const nextDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                    for (let nd of nextDirs) {
                        const fx = nx + nd[0], fy = ny + nd[1];
                        if (fx >= 0 && fx < GRID_SIZE && fy >= 0 && fy < GRID_SIZE) {
                            const fCell = board[fy][fx];
                            const hasOpp = otherPlayers.some(op => op.x === fx && op.y === fy);
                            // 「カードがある」または「敵がいる」なら将来動ける場所とカウント
                            if (!fCell.empty || hasOpp) futureMobility++;
                        }
                    }
                    // 将来の選択肢が少ない場所（0〜1箇所）は評価を大幅に下げて避ける
                    if (futureMobility <= 1) score -= 150;
                    else score += (futureMobility * 10); // 選択肢が多いほどプラス評価
                    /* ----------------------------------------------------- */

                    /* 2026/03/12 修正：移動ルール厳守（留まる選択肢の評価を基本-999に） */
                    if (isStaying) {
                        const isAtEnemyGate = enemyGatePos.some(eg => eg.x === p.x && eg.y === p.y);
                        if (isAtEnemyGate) {
                            score += 500; 
                        } else {
                            // 移動できるカードや相手が周囲にある場合、その場に留まるのは反則に近いため評価を最低にする
                            score = -999; 
                        }
                    }

                } catch (e) {
                    console.error("AI Scoring Error:", e);
                    score = 1;
                }
            } else {
                const distToGate = Math.min(...enemyGatePos.map(eg => getDistance({x: nx, y: ny}, eg)));
                score = (100 - distToGate);
            }

            if (score > maxScore) {
                maxScore = score;
                bestMoves = [{x: nx, y: ny, cell, epOn}];
            } else if (score === maxScore) {
                bestMoves.push({x: nx, y: ny, cell, epOn});
            }
        }
    } 
    
    const move = bestMoves.length > 0 ? bestMoves[Math.floor(Math.random() * bestMoves.length)] : null;

    if (move && typeof executeMove === 'function') {
        // --- 外科手術：AI思考ログの追加 ---
        addLog(`[DEBUG] AI ${p.name}: 点数 ${maxScore}pt でマス(${move.x}, ${move.y})を選択`, true);
        executeMove(move.x, move.y, move.cell, move.epOn); 
    } else {
        // ★外科手術2：移動できない場合は、ムーブを終了せず配置モード(autoPlace)へ繋ぐ
        addLog(`${p.name}は移動可能な場所がないため、配置に切り替えます。`);
        if (typeof autoPlace === 'function') {
            autoPlace(p);
        } else {
            isProcessingMove = false;
            isAutoAction = false;
            endTurn();
        }
    }
}

/**
 * 2026/03/03 修正
 * autoPlace を AI_SCORE_CONFIG 連動のスコアリング方式にアップデート
 */
function autoPlace(p) { 
    if (!p || !players || isProcessingMove || isHandEffectProcessing) return;
    
    const enemyGatePos = players.filter(pl => pl.id !== p.id).map(pl => pl.startPos); 
    const otherPlayers = players.filter(pl => pl.id !== p.id);
    const directions = [[0,1], [0,-1], [1,0], [-1,0]]; 
    
    /* 2026/03/13 修正：AIスコア設定の完全なデフォルト保証 */
    const cfg = {
        CARD_COUNT: 10, UNLOCKED_COLOR: 50, ADJACENT_ENEMY: 5,
        SELF_GATE_DEFENSE: 20, APPROACH_ENEMY_GATE: 20, REACH_ENEMY_GATE: 100,
        MOVE_TOWARD_GATE: 30, RARE_COLOR: 20, POWER_CARD_NEAR: 20, 
        STEAL_ACTION: 50, STACK_COUNT: 10, 
        ...(window.AI_SCORE_CONFIG || {}) // 既存の設定があれば上書き、なければ上記を使用
    };
    window.AI_SCORE_CONFIG = cfg; // グローバルに書き戻して NaN を防ぐ

    let bestPlaces = [];
    let maxScore = -Infinity;

    for (let d of directions) { 
        const nx = p.x + d[0], ny = p.y + d[1]; 
        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
        
        // 配置なので、そこが空いているかチェック（基本ルール）
        if (board[ny][nx].empty) {
            let score = 0;
            
            /**
 * 2026/03/06 修正
 * autoPlace を最新の評価基準（敵ゲート攻め+30、防衛+20）にアップデート
 */
            if (autoMode === 'NORMAL') {
                // 1. 敵ゲートへの距離評価（攻めの配置）
                const distToEnemyGate = Math.min(...enemyGatePos.map(eg => getDistance({x: nx, y: ny}, eg)));
                const currentDistToEnemyGate = Math.min(...enemyGatePos.map(eg => getDistance({x: p.x, y: p.y}, eg)));

                // 敵ゲートそのもの（1マス以内に自分がいる場合） (+100)
                if (distToEnemyGate === 0 && currentDistToEnemyGate <= 1) {
                    score += cfg.REACH_ENEMY_GATE;
                }
                // 直近の相手ゲートに近づくためのマス (+30)
                if (distToEnemyGate < currentDistToEnemyGate) {
                    score += cfg.MOVE_TOWARD_GATE;
                }

                // 2. 自ゲート付近の評価（守りの配置）
                const distToSelfGate = getDistance({x: nx, y: ny}, p.startPos);
                // 自ゲートの2マス以内に敵がいるかチェック
                const isEnemyNearSelfGate = otherPlayers.some(ep => getDistance({x: ep.x, y: ep.y}, p.startPos) <= 2);
                
                // 自ゲート防衛（2マス内に敵がいる状況で、自ゲート2マス以内に配置） (+20)
                if (isEnemyNearSelfGate && distToSelfGate <= 2) {
                    score += cfg.SELF_GATE_DEFENSE;
                }
            } else {
                // EASYモード：単純に敵ゲートに近い場所
                const distToEnemyGate = Math.min(...enemyGatePos.map(eg => getDistance({x: nx, y: ny}, eg)));
                score = (100 - distToEnemyGate);
            }

            if (score > maxScore) {
                maxScore = score;
                bestPlaces = [{x: nx, y: ny}];
            } else if (score === maxScore) {
                bestPlaces.push({x: nx, y: ny});
            }
        }
    } 
    
    const bestPlace = bestPlaces.length > 0 ? bestPlaces[Math.floor(Math.random() * bestPlaces.length)] : null;

    if (bestPlace && typeof executePlaceCard === 'function') {
        /* 2026/03/13 追加：AI配置スコアログ */
        addLog(`[DEBUG] AI ${p.name}: 配置点数 ${maxScore}pt でマス(${bestPlace.x}, ${bestPlace.y})を選択`, true);
        executePlaceCard(bestPlace.x, bestPlace.y); 
    } else {
        endTurn(); 
    }
}

/* 2026/03/14 修正：オンライン対戦時は勝手にフェイズを進めない */
function checkAutoSkip() { 
    if (window.MULTIPLAY.roomID) return; // オンライン時は完全停止

    if (winner || isAutoSkipping || isPlacingCard || (invasionQueue && invasionQueue.length > 0)) return;
    if (!players || !players[turn]) return;
    const p = players[turn]; 
    if (currentPhase === PHASE.LOCK) { 
        const hasLockableCard = hands[p.id] && hands[p.id].some(card => (card.type === "ETERNAL" && card.id !== 29) || (card.colorId === "rainbow" && card.id !== 29) || (card.colorId !== "white" && card.colorId !== "black" && card.id !== 29 && (collections[p.id][card.colorId].length === 0 || collections[p.id][card.colorId].some(cur => cur.id === 34))) ); 
        if (!hasLockableCard) { isAutoSkipping = true; setTimeout(() => { isAutoSkipping = false; nextPhase(); }, 1000); } 
    } 
    // After: isAutoAction (自動処理中) フラグを条件に追加し、連鎖スキップを防止
    else if (currentPhase === PHASE.HAND && hands[p.id] && hands[p.id].length === 0 && !isAutoAction) { 
        isAutoSkipping = true; setTimeout(() => { isAutoSkipping = false; nextPhase(); }, 1000); 
    } 
}

function checkStuck(p) { 
    if (!p) return true;
    
    // 修正：ディメンション効果中かつ未使用なら射程2、それ以外は射程1
    const moveRange = (p.dimensionActive && !p.baseMoveUsed) ? 2 : 1;
    
    // 全マスを走査して、現在の射程(moveRange)に移動可能なマスがあるかチェック
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const dist = Math.abs(p.x - x) + Math.abs(p.y - y);
            if (dist === moveRange) {
                const cell = board[y][x];
                const hasOpponent = players.some(ep => ep.id !== p.id && ep.x === x && ep.y === y);
                // カードがある、または他プレイヤーがいれば移動可能
                if (!cell.empty || hasOpponent) return false; 
            }
        }
    }
    return true; 
}


// 1. 先に processExile を定義します（アロー関数形式を維持）
const processExile = (tSlot) => {
    // 【追加】タイマーが動いていればクリアして二重実行を防ぐ
    if (autoProcessTimeout) {
        clearTimeout(autoProcessTimeout);
        autoProcessTimeout = null;
    }

    if (!players || !players[turn]) return;
    const p = players[turn];
    
    // 修正：呪い(ID:34)を含めて合計3枚重なると追放
    if (tSlot && tSlot.length >= 3 && tSlot.some(c => c.id === 34)) { 
        const cIdx = tSlot.findIndex(c => c.id === 34); 
        const curse = tSlot.splice(cIdx, 1)[0]; 
        tempAction = { card: curse };
        addLog("呪いが解けました！");
        
        if (typeof startSelectionMode === 'function') {
            startSelectionMode('select_cell', 1, 'exile_curse_logic', '呪いを盤面へ追放してください', () => { 
                checkWin(p.id); 
                if (!winner) nextPhase(); 
            }, null, null, true, p, false, null, null, null, p);
        } else {
            checkWin(p.id);
            if (!winner) nextPhase();
        }
    } else { 
        checkWin(p.id); 
        if (!winner) nextPhase(); 
    }
};


/**
 * 2026/03/11 新規追加：ロック実行前の割り込み検問所
 * 人間・AI・タイムアウトのすべてのロックはこの関数を通過します。
 */
/**
 * 2026/03/11 修正：割り込み検問所
 * 強欲なパレットと同様に、フェイズの制限を受けない直接実行ルートを構築。
 */
/**
 * 2026/03/11 修正：割り込み検問所（コストチェック追加版）
 */
/**
 * 2026/03/11 修正：割り込み検問所（最後のロック限定版）
 */
function requestLockCheck(card, cardIndex, lockedCard, p) {
    window.lastAttemptedColorId = card.colorId;
    window.activeLockingCard = card; 
    
    const myHand = hands[1] || [];
    const chottoCard = myHand.find(c => c.id === 21 && !c.sealed);
    const hasCost = myHand.some(c => (c.colorId === 'purple' || c.colorId === 'rainbow') && c !== chottoCard);

    // --- 追加：最後のロック判定 ---
    const currentLockedCount = LOCK_ORDER.filter(col => {
        const slot = collections[p.id][col.id];
        return slot && slot.length > 0 && 
               slot.some(c => c.colorId !== 'white' && c.colorId !== 'black') && 
               !slot.some(c => c.id === 34);
    }).length;

    const isNewColor = collections[p.id][card.colorId].length === 0;
    // 既に6色持っていて、今から7色目を置こうとしているなら「最後のロック」
    const isFinalLock = (currentLockedCount === 6 && isNewColor);

    // 条件に isFinalLock を追加
    if (chottoCard && hasCost && p.id !== 1 && isFinalLock) {
        addLog(`[Check] ${p.name}の最終ロックを検知！『ちょっと待った！』の使用を確認します。`);

        activeTimerPlayerId = 1; 
        isAutoAction = false;
        isAutoProcessing = false;
        if (typeof pauseTimer === 'function') pauseTimer();
        
        showDetailModal("ちょっと待った！", `${p.name}が勝利確定のロック（7色目）をしようとしています。割り込みますか？`, chottoCard, "使用する", () => {
            closeDetailModal();
            activeHandCard = chottoCard;
            isHandEffectProcessing = true;

            executeCardEffect(chottoCard.handEffect, players.find(pl => pl.id === 1), (res) => {
                const curIdx = hands[1].indexOf(chottoCard);
                if (curIdx > -1) discardPile.push(hands[1].splice(curIdx, 1)[0]);
                isHandEffectProcessing = false;
                renderHand();
            }, chottoCard);
        });

        const cnl = document.getElementById('detail-cancel-btn');
        if (cnl) {
            cnl.textContent = "パス";
            cnl.onclick = () => {
                closeDetailModal();
                activeTimerPlayerId = null;
                if (typeof resumeTimer === 'function') resumeTimer();
                proceedLockLogic(card, cardIndex, lockedCard, p);
            };
        }
    } else {
        // 最後のロックでない場合、または条件を満たさない場合は通常進行
        proceedLockLogic(card, cardIndex, lockedCard, p);
    }
}



/**
 * 2026/03/11 修正
 * CPU/自動処理時であっても、自分が「ちょっと待った！」を持っている場合は割り込み確認を強制表示するよう修正。
 */
function handleHandClick(cardIndex, lockedCard = null) {
    /* 2026/03/14 修正：自分の番以外はクリック無効 */
    if (window.MULTIPLAY.roomID && players[turn].id !== window.MULTIPLAY.playerNumber) return;

    const isAI = isAutoAction || isAutoProcessing;
    if (isPeekingMode || !players || !players[turn]) return;
    const displayTurn = isP1HandOnlyView ? 0 : turn;
    if (!isAI && displayTurn !== turn) {
        showToast("現在は P1 の手札を表示中ですが、操作権はありません。");
        return;
    }

    // 2026/03/11 修正：割り込み中(activeTimerPlayerIdが設定されている)なら、手番プレイヤーではなくタイマー保持者を優先する
    const actingP = activeTimerPlayerId ? players.find(pl => pl.id === activeTimerPlayerId) : players[turn];
    const p = actingP; // 以降、p は操作している人を指す
    const card = lockedCard || (hands[p.id] ? hands[p.id][cardIndex] : null);
    if (!card) return;

    if (currentPhase === PHASE.LOCK) {
        if (p.lockPrevented) return;
        if (card.colorId === 'white' || card.colorId === 'black' || card.id === 29) return;

        if (isAI) {
            // CPUやタイムアウト時は、確認なしで直接「検問所」へ
            requestLockCheck(card, cardIndex, lockedCard, p);
        } else {
            // 人間の場合は、「ロックする」を押した後に「検問所」へ
            showDetailModal("ロック確認", `「${card.name}」をロックしますか？`, card, "ロックする", () => {
                requestLockCheck(card, cardIndex, lockedCard, p);
            });
        }

    // 2026/03/11 修正：割り込み中、または「ちょっと待った」などの即時効果ならフェイズを問わず実行
    } else if (currentPhase === PHASE.HAND || card.handEffect?.anytime || activeTimerPlayerId === 1) { 
        // （ハンドフェイズの処理は変更なし）
        const executeLogic = () => {
            /* 2026/03/14 修正：手札使用の演出をオンライン同期 */
            if (window.MULTIPLAY && window.MULTIPLAY.roomID) {
                const roomRef = window.MULTIPLAY.db.collection("rooms").doc(window.MULTIPLAY.roomID);
                roomRef.update({
                    "lastCardEffect": {
                        cardId: card.id,
                        playerName: p.name,
                        timestamp: Date.now()
                    }
                });
            }

            showCardModal(card, () => {
                activeHandCard = card; 
                executeCardEffect(card.handEffect, p, (res) => { 
                    if (!lockedCard && hands[p.id]) { 
                        const curIdx = hands[p.id].indexOf(card); 
                        if (curIdx > -1) {
                            const removedCard = hands[p.id].splice(curIdx, 1)[0]; 
                            if (!(res && res.stayOnBoard)) discardPile.push(removedCard); 
                        }
                    } 
                    isAutoProcessing = false; 
                    isAutoAction = false;
                    resetTimer(); 
                    updateGameState(); 
                }, card);
            }, "手札効果発動！", p.name, "手札から効果を発動しました");
        };

        if (isAI) {
            executeLogic();
        } else {
            showDetailModal(card.handEffect?.anytime ? "割込使用確認" : "手札使用確認", "このカードを使用しますか？", card, "使用する", executeLogic);
        }
    }
}

/**
 * 2026/03/11 外科手術的追加：共通化したロック実行ロジック
 */
function proceedLockLogic(card, cardIndex, lockedCard, p) {
    if (card.colorId === 'rainbow') {
        const lockableColors = BASE_COLORS.filter(c => collections[p.id][c.id].length === 0);
        showSelectionModal("RAINBOW LOCK", "どの色としてロックしますか？", lockableColors, "card-back-pattern", 1, (sel) => {
            const targetColorId = sel[0].id;
            if(!lockedCard && hands[p.id]) hands[p.id].splice(cardIndex, 1);
            const tSlot = collections[p.id][targetColorId];
            tSlot.push(card);

            /* 2026/03/14 修正：レインボーロックを同期 */
            if (window.MULTIPLAY && window.MULTIPLAY.roomID && p.id === window.MULTIPLAY.playerNumber) {
                const roomRef = window.MULTIPLAY.db.collection("rooms").doc(window.MULTIPLAY.roomID);
                roomRef.update({
                    [`lock_${p.id}_${targetColorId}`]: collections[p.id][targetColorId].map(c => c.id),
                    "lastUpdate": Date.now()
                });
            }

            if (typeof triggerLockEffect === 'function') triggerLockEffect(p.id, targetColorId);
            addLog(`${p.name}が「${card.name}」を${sel[0].name}としてロック！`);
            setTimeout(() => {
                isAutoProcessing = false;
                processExile(tSlot);
                if (currentPhase === PHASE.LOCK && !winner) nextPhase();
            }, 1000);
        }, false, null, null, null, p);
        return;
    }

    const slot = collections[p.id][card.colorId];
    if(!lockedCard && hands[p.id]) hands[p.id].splice(cardIndex, 1);
    slot.push(card);

    /* 2026/03/14 修正：ロック情報をオンライン同期 */
    if (window.MULTIPLAY && window.MULTIPLAY.roomID && p.id === window.MULTIPLAY.playerNumber) {
        const roomRef = window.MULTIPLAY.db.collection("rooms").doc(window.MULTIPLAY.roomID);
        
        // 自分の全スロットの状態をIDの配列にして送る（もっとも確実な方法）
        const lockState = {};
        BASE_COLORS.forEach(bc => {
            lockState[`lock_${p.id}_${bc.id}`] = collections[p.id][bc.id].map(c => c.id);
        });

        roomRef.update({
            ...lockState,
            "lastUpdate": Date.now()
        }).catch(e => console.error("Lock Sync Error:", e));
    }

    if (typeof triggerLockEffect === 'function') triggerLockEffect(p.id, card.colorId);
    addLog(`<span style="color:${p.color.hex}">●</span> <b>${p.name}</b> <span class="text-yellow-500">🔒 LOCK</span> 「${card.name}」`);

    setTimeout(() => {
        isAutoProcessing = false;
        isAutoAction = false;
        processExile(slot);
        if (currentPhase === PHASE.LOCK && !winner) nextPhase();
    }, 1200);
}



// --- checkWin を呪い除外に修正 ---
function checkWin(pid) { 
    if(!collections[pid]) return;

    const lockedColors = LOCK_ORDER.filter(col => {
        const slot = collections[pid][col.id];
        return slot && slot.length > 0 && 
               slot.some(c => c.colorId !== 'white' && c.colorId !== 'black') && 
               !slot.some(c => c.id === 34);
    });
    
    if (lockedColors.length >= 7) { 
        winner = players.find(p => p.id === pid); 

        // 1. 経過時間などのデータ準備
        const playTimeSec = Math.floor((Date.now() - gameStartTime) / 1000);
        window.currentPlayTime = playTimeSec;

        // --- 外科手術的修正：プロフィールの更新と保存 ---
        updateProfileAfterGame(pid);

        /* 2026/03/12 修正：音響処理の確実化 */
        if (window.gameBGM) {
            window.gameBGM.pause();
            // 完全に初期化せず、一時停止のみで負荷を下げます
        }

        /**
 * 2026/03/17 修正
 * 勝敗判定時、プレイヤーIDの型に依存せず確実に自分(P1)の勝利かCPUの勝利かを判定し、
 * 適切な効果音(win.mp3 / lose.mp3)が再生されるよう修正。
 */
        if (typeof playSE === 'function') {
            // pidを数値に変換し、P1のID（通常は1）と比較
            const isMyWin = parseInt(pid) === 1;
            const seFile = isMyWin ? 'win.mp3' : 'lose.mp3';
            
            // デバッグログ：音源選択の正しさを確認
            console.log(`[GameEnd] WinnerID: ${pid}, isMyWin: ${isMyWin}, PlaySE: ${seFile}`);

            // BGMが止まった一瞬後にSEを再生
            setTimeout(() => {
                playSE(seFile);
            }, 150); // わずかにディレイを伸ばして再生を安定化
        }

        // --- ★ここから演出の接続 ---
        // すぐにオーバーレイを出さず、カメラ演出を呼び出す
        if (typeof performVictoryCameraWork === 'function') {
            performVictoryCameraWork(pid, () => {
                // 演出（ズーム＆衝撃波）が終わった後に実行される処理
                showVictoryUI(pid); 
            });
        } else {
            // 万が一演出関数がない場合のフォールバック
            showVictoryUI(pid);
        }
    }
}

function showResultModal(pid, stats) {
    const resultOverlay = document.getElementById('result-overlay');
    const container = document.getElementById('result-items-container');
    if (!resultOverlay || !container) return;

    const player = players.find(p => p.id === pid);
    const s = stats.time || 0;
    const timeStr = `${Math.floor(s / 60)}分${(s % 60).toString().padStart(2, '0')}秒`;

    // 1. 基本項目のリスト生成（勝者、タイム、ターン、MVP）
    const resultsHtml = [
        { label: "👑 勝者", value: player ? player.name : "不明" },
        { label: "⏳ タイム", value: timeStr },
        { label: "🔄 ターン", value: `${stats.turns || 0}` },
        { label: "🌟 MVP", value: stats.mvp || "なし" }
    ].map(item => `
        <div class="flex justify-between items-center bg-white/90 p-2 rounded border border-gray-300 shadow-sm">
            <span class="text-[10px] text-gray-600 font-bold">${item.label}</span>
            <span class="text-xs font-black text-black">${item.value}</span>
        </div>
    `).join('');

    // 2. 「逆転の兆し」グラフの生成 (変更なし)
    const history = stats.lockHistory || [];
    const turnCount = history.length;
    const padding = 10;
    const width = 280;
    const height = 60;

    const linesHtml = players.map((p, pIdx) => {
        if (turnCount < 2) return "";
        const points = history.map((counts, tIdx) => {
            const x = (tIdx / (turnCount - 1)) * (width - padding * 2) + padding;
            const y = height - (counts[pIdx] / 7) * (height - padding * 2) - padding;
            return `${x},${y}`;
        }).join(" ");
        return `<polyline points="${points}" fill="none" stroke="${p.color.hex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
    }).join("");

    const lineChartHtml = `
        <div class="mt-6 pt-4 border-t border-gray-700">
            <p class="text-[9px] text-gray-500 font-bold mb-2 text-center uppercase tracking-widest">Signs of Reversal (Lock Progress)</p>
            <div class="bg-gray-900/50 rounded p-1 border border-gray-700">
                <svg viewBox="0 0 ${width} ${height}" class="w-full h-auto">
                    ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                        const y = height - (i / 7) * (height - padding * 2) - padding;
                        return `<line x1="${padding}" y1="${y}" x2="${width-padding}" y2="${y}" stroke="#374151" stroke-width="0.5" />`;
                    }).join("")}
                    ${linesHtml}
                </svg>
            </div>
        </div>
    `;

    // 3. カラー使用統計バーチャートの生成 (変更なし)
    const maxVal = Math.max(...(stats.colorStats?.map(s => s.count) || [1]), 1);
    const chartHtml = `
        <div class="mt-6 pt-4 border-t border-gray-700">
            <p class="text-[9px] text-gray-500 font-bold mb-4 text-center uppercase tracking-widest italic">Color Usage Stats</p>
            <div class="flex items-end justify-between h-24 px-1 gap-2">
                ${(stats.colorStats || []).map(c => {
                    const heightPercent = (c.count / maxVal) * 100;
                    return `
                        <div class="flex-1 h-full flex flex-col justify-end items-center">
                            <div class="w-full bg-gray-800/50 rounded-t-sm flex flex-col justify-end h-full overflow-hidden">
                                <div class="${c.bg} w-full rounded-t-sm animate-grow-up" 
                                     style="height: ${heightPercent}%; background-color: ${c.hex} !important;">
                                </div>
                            </div>
                            <span class="text-[8px] text-gray-600 font-bold mt-1 truncate w-full text-center">${c.name}</span>
                            <span class="text-[9px] text-black font-mono font-bold">${c.count}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    // 内部的な称号解放処理（UIには出さないが、データとして解放する必要があるため計算のみ実行）
    const currentAwards = calculateAwards(pid);
    currentAwards.forEach(award => {
        if (award.pid === 1) {
            const cleanTitleName = award.name.replace(/[^\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FFa-zA-Z0-9]/g, "").trim();
            if (!userProfile.unlockedTitles.includes(cleanTitleName)) {
                userProfile.unlockedTitles.push(cleanTitleName);
                addLog(`🏆 新しい称号『${cleanTitleName}』を獲得しました！`);
            }
        }
    });

    // データの保存
    saveUserProfile();

    // 5. 統計情報のみをまとめて描画（ランクと称号のHTMLを削除）
    container.innerHTML = `
        <div class="space-y-2">${resultsHtml}</div>
        ${lineChartHtml}
        ${chartHtml}
    `;

    resultOverlay.classList.remove('hidden');
}

function startPlaceCardMode() { if (isPeekingMode) return; isPlacingCard = true; updateGameState(); }

/**
 * 2026/03/06 修正
 * 配置演出（3回点滅）を確実に視認できるよう処理順を厳密化。
 * animateCellBlinkの完了を待ってからデータを更新し、盤面を描画します。
 */
function executePlaceCard(x, y) { 
    if (isPeekingMode || !players || !players[turn]) return; 
    
    if (!isAutoAction) {
        if (typeof gainTime === 'function') gainTime(Math.min(5, currentPhaseMaxTime));
    }
    
    isProcessingMove = true;
    const p = players[turn]; 

    /**
 * 2026/03/06 修正
 * 配置時の点滅演出色をモード（ライト/ダーク）に応じて切り替えるように変更。
 * ライトモード時は黒、ダークモード時は白で発光させ視認性を高めます。
 */
    // ステップ1：点滅演出を実行
    // 表示モードに合わせて色を決定
    const blinkColor = isLightMode ? '#000000' : '#ffffff';

    const blinkPromise = (typeof animateCellBlink === 'function') 
        ? animateCellBlink(x, y, blinkColor) 
        : Promise.resolve();

    blinkPromise.then(() => {
        // ステップ2：演出が終わった直後にデータを更新
        const card = drawCard(); 
        if (card) { 
            board[y][x].empty = false; 
            board[y][x].revealed = false; 
            board[y][x].color = card; 
            board[y][x].stack = []; 
            addLog(`${p.name} が (${x}, ${y}) にカードを配置。`);
        }
        
        // 盤面を再描画（ここでカードが表示される）
        if (typeof renderBoard === 'function') renderBoard();

        // ステップ3：配置されたカードを確認するための「余韻」待機
        setTimeout(() => {
            isPlacingCard = false; 
            if (!p.baseMoveUsed) p.baseMoveUsed = true; 
            else if (p.extraMoves > 0) p.extraMoves--; 
            
            if (p.extraMoves > 0) { 
                addLog(`追加配置完了！(残り${p.extraMoves}回)`); 
                isProcessingMove = false; 
                resetTimer(); 
                updateGameState(); 
            } else { 
                endTurn(); 
            }
        }, 800); // 配置後の余韻
    });
}

function handleBoardClick(x, y) { 
    /* 2026/03/14 修正：自分の番以外はクリック無効 */
    if (window.MULTIPLAY.roomID && players[turn].id !== window.MULTIPLAY.playerNumber) return;
    
    if (winner || currentPhase !== PHASE.MOVE || isStuck || isPlacingCard || isProcessingMove || isPeekingMode || !players[turn]) return; 
    const p = players[turn]; 
    const dist = Math.abs(p.x - x) + Math.abs(p.y - y); 
    const isTarget = (p.dimensionActive && !p.baseMoveUsed) ? (dist === 2) : (dist === 1); 
    if (!isTarget) return; 
    
    /* --- 2026/03/11 修正：追加移動（ダッシュ等）時の接触禁止を徹底 --- */
    const cell = board[y][x];
    // クリックした先に他のプレイヤーがいるかチェック
    const epOn = players.find(ep => ep.id !== p.id && ep.x === x && ep.y === y); 
    
    // ★ 判定：これは「基本移動」ではなく「追加の移動」か？
    // p.baseMoveUsed が true である ＝ すでに1回目の移動を終えている状態
    const isExtraMoveMode = p.baseMoveUsed;

    // 1. 追加移動中は、相手がいるマス（epOn）をクリックしても無効にする
    if (isExtraMoveMode && epOn) {
        // addLog(`[System] 追加移動中に接触（強奪）はできません。`); // デバッグ用
        return; 
    }

    // 2. ディメンション（距離2）の跳躍中も、相手がいるマスへの移動は禁止
    if (dist === 2 && epOn) {
        return; 
    }

    // 3. 追加移動（ダッシュ/到着効果）の判定フラグをセット
    const isExtra = isExtraMoveMode && p.extraMoves > 0;

    // 3. 移動先が空（カードなし）で、かつプレイヤーもいない場合は移動不可
    if (cell.empty && !epOn) return; 
    if (p.konohanaPenalty && epOn) return; 
    if (p.marmegoPenalty && !epOn) return;
    
    showDetailModal(epOn ? "接触確認" : (isExtra ? "追加移動確認" : "移動確認"), epOn ? "接触して手札を奪いますか？" : (isExtra ? "<b>追加移動</b> 権利を消費して移動しますか？" : "ここへ移動しますか？"), (!epOn && cell.revealed) ? cell.color : null, "実行", () => executeMove(x, y, cell, epOn)); 
}

function executeMove(x, y, cell, epOn) { 
    if (!players[turn]) return;
    const p = players[turn];

    /* 2026/03/13 追加：移動開始のデバッグログ */
    addLog(`[DEBUG] executeMove 開始: ${p.name} -> (${x}, ${y})`, true);
    console.time(`Move-${p.name}`); // 処理時間を計測開始

    if (!isAutoAction) {
        if (typeof gainTime === 'function') gainTime(Math.min(5, currentPhaseMaxTime));
    }
    isProcessingMove = true;
    
    // 【追加】移動開始時に次元跳躍状態ならフラグを消費（リセット）
    if (p.dimensionActive && !p.baseMoveUsed) {
        p.dimensionActive = false; 
    }

    if (epOn) window.activeTargetPlayerForCounter = epOn; 
    // ----------------

    const moveFinish = () => { 
        /* 2026/03/13 追加：移動完了のデバッグログ */
        addLog(`[DEBUG] moveFinish 完了: ${p.name}`, true);
        console.timeEnd(`Move-${p.name}`); // 計測終了

        if (!p.baseMoveUsed) p.baseMoveUsed = true; 
    else if (p.extraMoves > 0) p.extraMoves--; 

    // ここで「自分のムーブフェイズか」を確認
    if (currentPhase === PHASE.MOVE) {
        if (p.extraMoves > 0) { 
            addLog(`追加移動権利残り ${p.extraMoves} 回`); 
            isProcessingMove = false; 
            resetTimer(); 
            updateGameState(); 
        } else { 
            checkAnytimeReactions(() => endTurn()); 
        } 
    } else {
        // ハンドフェイズ等での移動なら、単にフラグを下げて復帰
        isProcessingMove = false;
        updateGameState();
    }
};

    // 【外科手術的修正】接触か通常移動かを判別して詳細ログを出力
    if (epOn) {
        // ★ 外科手術的修正：接触時のアナウンス演出を追加
        const announcement = `<div class="text-xl font-black text-yellow-500 mb-2 italic">CONTACT!!</div>
                              <div class="text-sm">
                                <span style="color:${p.color.hex}">●</span><b>${p.name}</b> が<br>
                                <span style="color:${epOn.color.hex}">●</span><b>${epOn.name}</b> に接触します！
                              </div>`;
        
        // ログ出力
        addLog(`${p.name} が ${epOn.name} に接触しました！`);

        // アナウンスを表示してから、実際の処理（反撃確認など）へ
        if (typeof showMessageOverlay === 'function') {
            showMessageOverlay(announcement, 2500, () => {
                startStealSequence(epOn, moveFinish); 
            });
        } else {
            // 万が一関数がない場合の安全策
            startStealSequence(epOn, moveFinish);
        }
    } else {
        // 2026/03/06 修正：ログの視認性向上（プレイヤーカラー＋アイコン）
        addLog(`<span style="color:${p.color.hex}">●</span> <b>${p.name}</b> <span class="text-gray-400">👟 移動</span> (${x}, ${y})`);

        /* 2026/03/14 修正：移動同期を最優先で Firebase へ送る */
        if (window.MULTIPLAY && window.MULTIPLAY.roomID && p.id === window.MULTIPLAY.playerNumber) {
            const roomRef = window.MULTIPLAY.db.collection("rooms").doc(window.MULTIPLAY.roomID);
            roomRef.update({
                "lastMove": { playerId: p.id, x: x, y: y, timestamp: Date.now() },
                "lastUpdate": Date.now()
            }).catch(e => console.error("Move Sync Error:", e));
        }

        moveToCell(p, x, y, false, moveFinish); 
    }
}

/**
 * 2026/03/08 02:15 修正
 * 1. startStealSequence 内の構文エラー（不要な閉じカッコ）を清掃。
 * 2. 反撃演出(showCardModal)とAI自動処理の分岐ロジックを正確に統合。
 */

/**
 * 2026/03/08 11:45 修正
 * 1. 反撃者が人間(P1)の場合、システム全体の自動化フラグ(isAutoAction等)を一時的に強制解除。
 * 2. CPUのターン中であっても、P1の反撃確認モーダルがスキップされずに必ず表示されるよう修正。
 */
function startStealSequence(victim, callback) { 
    if (!players[turn] || !hands[victim.id]) return;
    const turnPlayer = players[turn]; 
    
    const counterCard = hands[victim.id].find(c => c.id === 22); 
    
    if (counterCard) {
        // ★ 内部関数：反撃の演出と処理を実行
        const processCounter = () => {
            showCardModal(counterCard, () => {
                hands[victim.id].splice(hands[victim.id].indexOf(counterCard), 1); 
                discardPile.push(counterCard); 
                addLog(`${victim.name}が「反撃」を発動！`); 

                // 【外科手術的修正】反撃成功時、攻守を完全に入れ替える
                // victim（反撃した人）が新しい「侵攻者（奪う側）」になり、
                // 元々の侵攻者（turnPlayer）が新しい「被害者」になります。
                const newInvader = victim; 
                const newVictim = turnPlayer;

                // startStealSequenceInternal を直接呼び出し、第三引数に「新しい奪う側」を明示的に渡す
                if (typeof startStealSequenceInternal === 'function') {
                    startStealSequenceInternal(newVictim, callback, newInvader);
                }
            }, "手札効果発動", victim.name, "「反撃」で逆に奪い返します！");
        };

        // ★ 外科手術的修正：P1(自分)が狙われた場合、自動処理を一時停止させる
        if (victim.id === 1) {
            isAutoAction = false;       // 自動実行フラグを折る
            isAutoProcessing = false;   // 自動処理中フラグを折る
            if (typeof pauseTimer === 'function') pauseTimer(); // タイマーも止める
        }

        // 修正：victim.id !== 1 (自分以外) なら自動処理を許可
        if (isAutoAction && victim.id !== 1) {
            processCounter();
        } 
        else {
            // 自分(P1)の場合は、ここで確実にモーダルが表示され、入力待ちになります
            showDetailModal("反撃のチャンス", `${victim.name}さん、「反撃」で接触を無効化し、逆に強奪しますか？`, counterCard, "反撃する", () => {
                // OKを押した後は、必要に応じてフラグを戻すことも検討できますが、
                // 基本は演出（processCounter）へ流します
                processCounter();
            }, false);

            const cnlBtn = document.getElementById('detail-cancel-btn'); 
            if(cnlBtn) { 
                cnlBtn.textContent = "使わない"; 
                cnlBtn.onclick = () => { 
                    closeDetailModal(); 
                    startStealSequenceInternal(victim, callback); 
                }; 
            }
        }
        return;
    } 

    if (typeof startStealSequenceInternal === 'function') {
        startStealSequenceInternal(victim, callback);
    }
}

/**
 * 2026/03/11 修正
 * 強奪モーダルのキャンセル（閉じる）ボタンを非表示にし、必ずカードを選ばせるように変更。
 */
/**
 * 2026/03/12 修正
 * 強奪チャンスの際、カードが表向きに見えてしまう不具合を修正（引数の位置を正確に指定）
 */
/**
 * 2026/03/12 修正
 * 強奪チャンスの引数構造を game_ui_modal.js の定義（全11引数）に完全準拠させ、
 * 第7引数に false を確実に渡すことでカードが表向きになる不具合を修正。
 */
/**
 * 2026/03/12 修正
 * 強奪チャンスにおいて、カードが表向きで見えてしまう不具合を修正。
 * 第7引数 isBlind を true に設定することで、意図通り裏向き（？表示）で選ばせるように変更。
 */
function startStealSequenceInternal(victim, callback, overrideInvader = null) {
    const invader = overrideInvader || players[turn];
    if (!hands[victim.id] || hands[victim.id].length === 0) { finishSteal(victim, null, callback, invader); return; } 
    
    showSelectionModal(
        "強奪チャンス", 
        `${invader.name}さん、1枚奪え！`, 
        hands[victim.id], 
        "card-back-pattern", 
        1, 
        (cards) => finishSteal(victim, cards[0], callback, invader), 
        true,  // 7: isBlind を true（裏向きにする）に変更
        null, 
        null, 
        null, 
        invader
    );
}

/** 2026/03/09 修正：接触強奪時のカード確認モーダルを追加 **/
/**
 * 2026/03/11 修正
 * 接触演出（ガツン）が終わるのを1秒待ってから強奪モーダルを表示するように変更。
 */
function finishSteal(victim, card, callback, invader) { 
    // 1. まず接触演出（衝撃波と画面揺れ）を即座に実行
    if (typeof playContactEffect === 'function') {
        playContactEffect(victim.x, victim.y);
    }

    // 次のステップに進むための共通処理を関数化
    const proceed = () => {
        if (victim.x === victim.startPos.x && victim.y === victim.startPos.y) { 
            if(callback) callback(); 
        } 
        else { 
            activeTimerPlayerId = victim.id; 
            moveToCell(victim, victim.startPos.x, victim.startPos.y, true, () => {
                activeTimerPlayerId = null; 
                if(callback) callback();
            }); 
        }
    };

    if (card) { 
        // データの移動
        hands[victim.id].splice(hands[victim.id].indexOf(card), 1); 
        hands[invader.id].push(card); 
        
        addLog(`<span style="color:${invader.color.hex}">●</span> <b>${invader.name}</b> <span class="text-red-500">💥 強奪</span> ➔ <b>${victim.name}</b> の 『${card.name}』`);

        // ★ 外科手術：演出をしっかり見せるために、1000ミリ秒（1秒）待機してから表示
        setTimeout(() => {
            if (typeof showCardModal === 'function') {
                showCardModal(card, () => {
                    renderHand();
                    proceed();
                }, "カード強奪", invader.name, `${victim.name} から奪いました！`);
            } else {
                renderHand();
                proceed();
            }
        }, 1000); // ここで1秒待つ

    } else {
        // カードを奪えなかった場合も、演出の余韻を待ってから帰還させる
        addLog(`${victim.name} は手札を持っていませんでした。`);
        setTimeout(proceed, 1000);
    }
}

async function moveToCell(player, tx, ty, isForced, callback, preArrival, extraClass = null) { 
    if (!player) return;
    const marker = document.getElementById(`p${player.id}-marker`);
    const cell = board[ty][tx];
    const destinationCard = cell.empty ? null : cell.color;
    const isNoOpen = (isForced === 'no_open');
    const isDashMove = (isForced === 'dash_move');
    const isNewReveal = destinationCard && !cell.revealed && !isNoOpen;

    if (marker && extraClass) marker.classList.add(extraClass);

    // 内部処理用の関数
    const executeLogic = () => {
        if (player.x >= 0 && player.y >= 0) {
            const dist = Math.abs(player.x - tx) + Math.abs(player.y - ty);
            if (playerStats[player.id]) playerStats[player.id].moveCount += dist;
        }
        player.prevX = player.x; 
        player.prevY = player.y; 
        /** 2026/03/09 修正：ゲート侵入の監視 **/
        player.x = tx; 
        player.y = ty;

        const gateOwner = players.find(pl => pl.startPos.x === tx && pl.startPos.y === ty);
        if (gateOwner && gateOwner.id !== player.id) {
            // 侵攻回数をプラス
            matchStats.gateInvasionCount[gateOwner.id] = (matchStats.gateInvasionCount[gateOwner.id] || 0) + 1;
            
            if (!matchStats.gateInvaded) matchStats.gateInvaded = {};
            matchStats.gateInvaded[gateOwner.id] = true; 
            addLog(`[System] ${gateOwner.name} のゲートが ${player.name} に突破されました！ (通算 ${matchStats.gateInvasionCount[gateOwner.id]} 回目)`);
        }

        if (marker && extraClass) marker.classList.remove(extraClass);
        if (destinationCard && !isNoOpen) cell.revealed = true; 
        if (typeof renderBoard === 'function') renderBoard(); 

        const proceedToArrival = () => { 
            if (isDashMove || isNoOpen) {
                if (callback) callback();
                return;
            }
            player.pendingComboCallback = callback;
            if (destinationCard) { 
                player.processedArrivalCard = destinationCard;

                /* --- 修正箇所：ここで処理中フラグを立てる --- */
                isProcessingMove = true; 
                handleArrivalLogic(cell, player, null, destinationCard, isNewReveal); 
                
            } else if(callback) { 
                callback(); 
            }
        };

        if (destinationCard && !isNoOpen) {
            setTimeout(preArrival ? () => preArrival(proceedToArrival) : proceedToArrival, 800); 
        } else {
            if(preArrival) preArrival(proceedToArrival); else proceedToArrival();
        }
    };

    if (marker && !isForced) { 
        const startRect = marker.getBoundingClientRect();
        const boardEl = document.getElementById('board-grid');
        // 移動中、盤面全体の「はみ出し禁止」設定を一時的に解除して駒を見えるようにする
        boardEl.style.overflow = "visible";
        const destCellEl = boardEl ? boardEl.children[ty * GRID_SIZE + tx] : null;

        if (destCellEl) {
            const endRect = destCellEl.getBoundingClientRect(); 
            // 物理的に最前面に来るよう、z-indexを非常に高く設定
            marker.style.zIndex = "99999"; // 移動中は最高位
            marker.style.transition = "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
            marker.style.transform = `translate(${endRect.left - startRect.left}px, ${endRect.top - startRect.top}px)`; 
            
            await new Promise(resolve => setTimeout(resolve, 600));

            // 移動完了後に元に戻す
        boardEl.style.overflow = ""; 
        marker.style.zIndex = "";

            marker.style.transition = "none";
            marker.style.transform = "none";
            marker.style.zIndex = ""; 
            
            // 重要：ここでは executeLogic を呼ばず、外部の制御（await）に任せる
            // ただし、通常の移動も壊さないよう、isForced === 'manual' のような判定が必要ですが、
            // 今回はフォース専用の制御を modal 側で完遂させます。
        }
    }
    
    // フォース演出以外（通常の移動など）との互換性を保つため
    // callbackがない＝外部(async)で制御しているとみなし、ロジック実行を切り離します。
    if (callback) {
        executeLogic();
    } else {
        // --- 外科手術的修正：callbackがない場合の「自動継続」ロジック ---
        player.x = tx; player.y = ty;
        if (typeof renderBoard === 'function') renderBoard();

        // 連続到達（コンボ）の有無を確認
        const hasCombo = (destinationCard && cell.stack && cell.stack.length > 0 && cell.stack[0].revealed !== false);
        
        if (!hasCombo) {
            // これ以上到達がない場合、AIやフェイズの進行を阻害しないようフラグを下ろす
            isProcessingMove = false;
            
            // 現在のターンプレイヤーと移動したプレイヤーが違う場合（フォース等）
            if (player.id !== players[turn].id) {
                if (typeof updateGameState === 'function') updateGameState();
                
                // AIのターンなら思考を再開させる
                if (isAutoAction && typeof aiUseHandCard === 'function') {
                    setTimeout(() => aiUseHandCard(players[turn]), 500);
                }
            }
        }
    }
}

/**
 * 2026/03/11 修正
 * 到達効果の解決にあたり、操作権(activeTimerPlayerId)を「到達した駒の主」に一時委譲するように変更。
 * これにより、フォース等で動かされたCPUが「ダッシュ」を踏んだ際、CPU自身が移動先を選ぶようになります。
 */
function handleArrivalLogic(cell, player, callback, cardObj, isNewReveal = false) {
    const curC = cardObj || cell.color;
    
    /* 2026/03/13 追加：到達検知のエラーキャッチ */
    if (!curC) { 
        addLog(`[ERROR] handleArrivalLogic: カードデータが消失しています (${player.name})`, true);
        if (callback) callback(); 
        return; 
    }
    addLog(`[DEBUG] 到達効果チェック: ${player.name} が 『${curC.name}』 に接触`, true);

    // 【外科手術的追加】操作主を「駒の持ち主」へ一時的に切り替える
    // 従来の turn プレイヤーではなく、この player がタイムバーを支配するようにします
    activeTimerPlayerId = player.id; 

    // 到達したのが人間(P1)なら、CPUのターン中であっても手動操作モードに切り替える
    if (player.id === 1) {
        isAutoAction = false;       
        isAutoProcessing = false;   
        if (typeof pauseTimer === 'function') pauseTimer(); 
    } else {
        // 到達したのがCPUなら、自動処理モードをオンにする
        isAutoAction = true;
        isAutoProcessing = true;
        if (typeof resumeTimer === 'function') resumeTimer();
    }
    
    player.processedArrivalCard = curC;

    /* --- 修正箇所：冒頭に発光演出と待機処理を追加 --- */
    // 1. まずド派手な発光をトリガー
    triggerArrivalRipple(player.x, player.y, curC.hex);

    // 2. 演出と余韻（計 約1.2秒）待ってから、本来のモーダル処理を開始する
    setTimeout(() => {

    /* --- 既存の雷演出(ID:24)や player.currentArrivalCard 設定、isDash判定等は変更なし --- */
        player.currentArrivalCard = curC;
        const isDash = curC.id === 15;

        const executeAndFollowUp = () => {
        executeCardEffect(curC.arrivalEffect, player, (res = {}) => {
            
            // 【重要】cleanupCellを修正：カードが消えたらフラグをリセット
            /** 2026/03/09 修正：エターナル獲得時のカウントと勝利時フラグの記録 **/
            const cleanupCell = () => {
                if (!(res && res.stayOnBoard)) {
                    // エターナル獲得時のカウントアップ（P1のみ）
                    if (player.id === 1 && curC.type === "ETERNAL") {
                        userProfile.totalEternalGets = (userProfile.totalEternalGets || 0) + 1;
                    }
                    // 勝利判定用に、最後にロックしたカードのタイプを記憶（checkWin直前で使用）
                    player.lastLockedCardType = curC.type;

                    if (cell.stack && cell.stack.length > 0) {
                   
                        cell.color = cell.stack.shift();
                        cell.revealed = cell.color.savedRevealedState || false;
                        delete cell.color.savedRevealedState;
                        cell.empty = false;
                    } else {
                        cell.empty = true;
                        cell.revealed = false;
                        cell.color = null;
                        cell.stack = [];
                    }
                }
                player.processedArrivalCard = null; 
                // --- 修正箇所：カードが入れ替わった直後に描画を更新し、監視に知らせる ---
                renderBoard(); 
            };

            const afterGain = () => { 
                // 【追加】ここでフラグをリセットすることで、獲得しなかった場合や
                // 盤面にカードが残る効果の場合でも、次の監視（あるいは同じカードの再検知）を許可する
                player.processedArrivalCard = null;
                
                // --- 既存ロジック：move_range_1 ---
                if (res.followUpAction === 'move_range_1') {
                    startSelectionMode('select_cell', 1, 'move_player', '改めて1マス移動してください', callback, 1, null, true, player, false, null, "おまかせ", null, player); 
                }
                // --- 既存ロジック：delayed_move ---
                else if (res.followUpAction === 'delayed_move') {
                    moveToCell(player, res.targetX, res.targetY, false, callback); 
                }
                // --- 既存ロジック：chotto_matta_flow (非常に重要) ---

                else if (res.followUpAction === 'chotto_matta_flow') { 
                    player.x = player.prevX; 
                    player.y = player.prevY; 
                    updateGameState(); 
                    
                    const dirs = [[0,1], [0,-1], [1,0], [-1,0]]; 
                    const validCells = [];
                    dirs.forEach(([dx, dy]) => { 
                        const nx = player.x + dx, ny = player.y + dy; 
                        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                            const targetCell = board[ny][nx];
                            const isOccupied = players.some(pl => pl.x === nx && pl.y === ny);
                            if (!(nx === cell.x && ny === cell.y) && !targetCell.empty && !isOccupied) {
                                validCells.push({x: nx, y: ny});
                            }
                        }
                    }); 

                    if(validCells.length === 0) { 
                        /* 2026/03/12 修正：再移動先がない場合の自動化対応 */
                        if (typeof showDetailModal === 'function') {
                            // 第7引数(hideCancel)を true にし、さらに第8引数（新設予定の actingP）に player を渡す
                            showDetailModal("ちょっと待てなかった", "移動できる有効なマスが周囲にありませんでした。", curC, "獲得する", () => {
                                // showCardModal の第6引数に player を追加
                                showCardModal(curC, () => { 
                                    if(hands[player.id]) hands[player.id].push(curC); 
                                    cleanupCell(); 
                                    renderHand(); 
                                    renderBoard(); 
                                    if (player.pendingComboCallback) {
                                        const fCb = player.pendingComboCallback;
                                        player.pendingComboCallback = null;
                                        fCb();
                                    } else if (callback) {
                                        callback();
                                    }
                                }, "到達獲得", player.name, "獲得しました", player);
                            }, true, player); // ここで player を渡す（showDetailModal側の修正が必要）
                        } else {
                            if(hands[player.id]) hands[player.id].push(curC); 
                            cleanupCell(); 
                            if (callback) callback();
                        }
                    } else { 
                        // (validCellsがある場合の処理は変更なし)
                        /* 2026/03/12 修正：ちょっと待った！の再移動引数を正確に配置 */
                        startSelectionMode(
                            'select_cell', 
                            1, 
                            'chotto_re_move', 
                            '改めて1マス移動してください', 
                            (mRes) => { 
                                if (!mRes || !mRes[0]) { finalizeComboOrCallback(); return; }
                                moveToCell(player, mRes[0].x, mRes[0].y, 'dash_move', () => {
                                    // 第6引数に player を追加（後述の修正と連動）
                                    showCardModal(curC, () => { 
                                        if(hands[player.id]) hands[player.id].push(curC); 
                                        cleanupCell(); 
                                        renderHand(); renderBoard(); 
                                        const nextCell = board[player.y][player.x];
                                        if (!nextCell.empty) {
                                            handleArrivalLogic(nextCell, player, callback, nextCell.color, true);
                                        } else {
                                            finalizeComboOrCallback();
                                        }
                                    }, "到達獲得", player.name, "獲得しました", player); 
                                });
                            }, 
                            1,                   // 6: range
                            {x: cell.x, y: cell.y}, // 7: forbiddenTile
                            true,                // 8: noCancel
                            player,              // 9: origin
                            false,               // 10: isEightDirection
                            null,                // 11: cancelCallback
                            "おまかせ",          // 12: autoBtnText
                            null,                // 13: restrictedCells
                            player               // 14: actingPlayer (ここが重要！)
                        );
                    } 
                    return; 
                }

                // --- 共通処理：コンボ判定またはコールバック実行 ---
                const finalizeComboOrCallback = () => {
                    // 【外科手術的追加】すべての到達処理が終わったため、操作権を返却する
                    activeTimerPlayerId = null; 

                    const nextCell = board[player.y][player.x];
                    const hasNextCombo = !nextCell.empty && nextCell.revealed && player.processedArrivalCard !== nextCell.color;

                    if (hasNextCombo) {
                        addLog(`[Combo] ${player.name}の足元で連続到達を検知。`);
                        // --- 修正箇所：移動中フラグを解除して、renderBoardの監視を通るようにする ---
                        isProcessingMove = false; 
                        renderBoard(); 
                    } else {
                        // --- 既存の終了処理 ---
                        if (player.pendingComboCallback) {
                            const fCb = player.pendingComboCallback;
                            player.pendingComboCallback = null;
                            
                            const finalCheckCell = board[player.y][player.x];
                            if (!finalCheckCell.empty && finalCheckCell.revealed && player.processedArrivalCard !== finalCheckCell.color) {
                                isProcessingMove = false; // 念押し解除
                                renderBoard();
                                return; 
                            }
                            
                            if (fCb) fCb();
                        } else if (callback) {
                            callback();
                        }
                    }
                };

                // followUpActionがない通常の場合に実行
                if (!['delayed_move', 'chotto_matta_flow', 'move_range_1', 'placed_on_board'].includes(res.followUpAction)) {
                    finalizeComboOrCallback();
                }
            };

            /* 2026/03/12 修正：ダッシュ(ID:15)到達時、第6引数に player を渡してCPUなら自動処理させる */
            if (isDash) {
                cleanupCell();
                renderBoard();
                showCardModal(curC, () => {
                    if(hands[player.id]) hands[player.id].push(curC);
                    renderHand();
                    const nextCell = board[player.y][player.x];
                    if (!nextCell.empty) {
                        handleArrivalLogic(nextCell, player, callback, nextCell.color, true);
                    } else if (callback) {
                        callback();
                    }
                }, "到達獲得", player.name, "獲得しました", player);
            } else {
                const shouldGain = !res.preventGain;
                if (shouldGain) {
                    // 【修正】モーダルを出す前に、まず盤面からカードを物理的に消去（または移動）する
                    // これにより、自動処理が重なっても「同じマスにまだカードがある」と誤認されなくなります
                    if (hands[player.id]) hands[player.id].push(curC);
                    cleanupCell(); 
                    
                    /* 2026/03/12 修正：通常の到達獲得時、第6引数に player を渡してCPUなら自動処理させる */
                    showCardModal(curC, () => { 
                        // すでに手札追加とクリーンアップは済んでいるので、描画と後続処理のみ行う
                        renderHand(); 
                        renderBoard(); 
                        renderDeckAndDiscard(); 
                        afterGain(); 
                    }, "到達獲得", player.name, "獲得しました", player); 
                }
                else { 
                    // 「ちょっと待った！」の場合、cleanupCellはafterGain内の非同期処理で行うため、ここでは行わない
                    if (res.followUpAction === 'chotto_matta_flow') {
                        afterGain();
                    } else {
                        // 【修正箇所】「にじいろの呪い」などは rainbow_curse_logic 内で既にロックエリアへ
                        // 移動済みのため、ここで discardCard(curC) を呼ぶと捨て札に重複してしまう。
                        // curC.id === 34 (にじいろの呪い) の場合は捨て札処理をスキップする。
                        if (!(res && res.stayOnBoard) && curC.id !== 34) {
                            discardCard(curC); 
                        }
                        cleanupCell(); 
                        renderBoard(); 
                        afterGain();
                    }
                }
            }
        }, curC, isNewReveal);
    };

    /* --- 既存のモーダル呼び出しをこの位置で実行 --- */
        showCardModal(curC, () => {
            executeAndFollowUp();
        }, "到達効果発動", player.name, "到達！到達効果が発動します");

    }, 800); // 1.2秒の待機（発光アニメーションの時間）
}

function checkGateInvasionForAll() { 
     invasionQueue = []; 
    if(!players) return;
    players.forEach(p => { 
        const victim = players.find(v => v.id !== p.id && v.startPos.x === p.x && v.startPos.y === p.y); 
        if (victim) invasionQueue.push({ invader: p, victim: victim }); 
    }); 
    if (invasionQueue.length > 0) { 
        const overlay = document.getElementById('invasion-overlay'); 
        if(overlay) overlay.classList.remove('hidden'); 
        setTimeout(() => { if(overlay) overlay.classList.add('hidden'); processInvasionQueue(); }, 1500); 
    } else {
        /* 2026/03/15 修正：二重進みを防ぐため nextTurn ではなく直接 turn を進めて startTurn を呼ぶ */
        const nextT = (turn + 1) % players.length;
        turn = nextT;
        startTurn();
    }
}

function processInvasionQueue() { if (!invasionQueue || invasionQueue.length === 0) { nextTurn(); return; } const { invader, victim } = invasionQueue.shift(); processHandSteal(invader, victim); }

/**
 * 2026/03/11 修正
 * ゲート侵攻時の手札強奪を可視化。奪ったカードをモーダルで全員に通知します。
 */
function processHandSteal(invader, victim) { 
    const vHand = hands[victim.id] || []; 
    const sCount = Math.floor(vHand.length / 2); 

    if (sCount > 0) {
        /* 2026/03/13 修正：引数の順番を showSelectionModal の定義に完全一致させる */
        showSelectionModal(
            "HAND STEAL", 
            `${victim.name}の手札から${sCount}枚選んで奪います`, 
            vHand, 
            "card-back-pattern", 
            sCount, 
            (cards) => { 
                // 1. データの移動
                cards.forEach(c => { 
                    vHand.splice(vHand.indexOf(c), 1); 
                    hands[invader.id].push(c); 
                }); 

                // 2. 奪ったカードを見せる
                if (typeof showCardModal === 'function') {
                    showCardModal(cards, () => {
                        renderHand();
                        processEternalAcquisition(invader, victim);
                    }, "ゲート侵攻：カード強奪", invader.name, `${victim.name} からカードを奪いました！`, invader);
                } else {
                    renderHand();
                    processEternalAcquisition(invader, victim);
                }
            }, 
            true,         // 7: isBlind
            null,         // 8: cancelCallback
            "自動取得",    // 9: autoBtnText (これを入れることでCPUが自動選択可能になる)
            null,         // 10: restrictedCells
            invader       // 11: actingPlayer (ここが最重要！)
        ); 
    } else { 
        // 奪う手札がない場合は即座に次へ
        processEternalAcquisition(invader, victim); 
    } 
}

/**
 * 2026/03/12 修正
 * CPUのゲート侵攻時、エターナルカードをプレイヤーが選ばされる不具合を修正。
 * 第7引数（isBlind）を false にすることで、公開状態（CPU自動選択対象）に切り替え。
 */
/**
 * 2026/03/12 修正：エターナル報酬選択
 * 1. 第7引数を true に戻し、本来のルール通り「裏向き」で選ばせる。
 * 2. 第10引数（autoLabel）に文字列を渡すことで、CPUが自動選択できるように修正。
 */
function processEternalAcquisition(invader, victim) { 
    if (eternalDeck && eternalDeck.length > 0) { 
        showSelectionModal(
            "ETERNAL SELECTION", 
            "エターナルカードを1枚選び獲得します", 
            eternalDeck, 
            "eternal-back-pattern", 
            1, 
            (cards) => { 
                const c = cards[0]; 
                eternalDeck.splice(eternalDeck.indexOf(c), 1); 

                if (typeof showCardModal === 'function') {
                    showCardModal(c, () => {
                        const slot = collections[invader.id][c.colorId]; 
                        const persistentCards = [];
                        while(slot.length > 0) {
                            const top = slot.pop();
                            if (top.type === 'FIRST' || top.type === 'BOOST') {
                                persistentCards.push(top);
                            } else {
                                hands[invader.id].push(top);
                            }
                        }
                        persistentCards.forEach(pc => slot.push(pc));
                        slot.push(c);

                        checkWin(invader.id); 
                        processForcedReturn(invader); 
                    }, "エターナルカード獲得！", invader.name, `ゲート侵攻報酬：『${c.name}』をロックしました。`, invader); // 第6引数に invader 追加
                } else {
                    const slot = collections[invader.id][c.colorId];
                    slot.push(c);
                    checkWin(invader.id); 
                    processForcedReturn(invader); 
                }
            }, 
            true,  // 7: isBlind を true に。これで裏向きになります
            null,  // 8: cancelCallback
            null,  // 9: cancelLabel
            "自動取得", // 10: autoLabel。これがあることで裏向きでもCPUが選択可能になります
            invader // 11: actingP
        ); 
    } else {
        processForcedReturn(invader); 
    } 
}

function processForcedReturn(invader) { const gate = invader.startPos; setTimeout(() => { const gCell = board[gate.y][gate.x]; if (!gCell.empty) { showCardModal(gCell.color, () => { if(hands[invader.id]) hands[invader.id].push(gCell.color); if(gCell.stack?.length > 0) { gCell.color = gCell.stack.shift(); gCell.revealed = gCell.color.savedRevealedState || false; gCell.empty = false; } else { gCell.empty = true; } invader.x = gate.x; invader.y = gate.y; updateGameState(); setTimeout(processInvasionQueue, 1000); }, "自ゲートのカード獲得", invader.name, "獲得しました"); } else { invader.x = gate.x; invader.y = gate.y; updateGameState(); setTimeout(processInvasionQueue, 1000); } }, 1000); }

/**
 * 2026/03/17 修正
 * ゲーム終了時、盤面・ステータスエリア・操作ボタンなどを完全に隠し、
 * ホーム画面と重ならないようクリーンアップ処理を強化。
 */
function cleanupGame() { 
    // 1. モーダルやオーバーレイを隠す
    ['setup-overlay','winner-overlay','arrival-modal','selection-modal','detail-modal','player-detail-modal','invasion-overlay','test-mode-modal','settings-modal','discard-modal'].forEach(id => { 
        const el = document.getElementById(id); if(el) el.classList.add('hidden'); 
    }); 

    // 2. ゲームプレイ中のメインUI要素を隠す（★追加箇所）
    const gameUIElements = [
        'area-p1', 'area-p2', 'area-p3', 'area-p4', // 相手と自分のステータスエリア
        'hand-area-container',                      // 手札エリア
        'my-lock-container',                        // ロックエリア
        'timer-wrapper',                            // タイマー
        'skip-btn',                                 // 「ロックしない」等の右下ボタン
        'peek-board-container'                      // 盤面確認ボタン
    ];
    gameUIElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    if(timerInterval) clearInterval(timerInterval); 
    timerInterval = null; 
    selectionState.active = false; 
    managePeekUI(false); 
    
    players = []; board = []; deck = []; eternalDeck = []; discardPile = []; hands = {}; collections = {}; turn = 0; winner = null; currentPhase = PHASE.LOCK; isEndingTurn = false; isProcessingMove = false; 
    const appEl = document.getElementById('app');
    if (appEl) appEl.classList.remove('selection-active');
}

async function initGameInternal(num, isTest = false) { 

    /** 2026/03/09 修正：試合開始時の統計リセットと履歴記録 **/
    gameStartTime = Date.now(); 
    totalTurnCount = 1; 
    cardUsageStats = {}; 
    lockHistory = [];

    // --- 称号判定用カウンター(matchStats)の初期化 ---
    matchStats = {
    stolenCount: {},        // 奪った数
    matchVictimCount: {},   // 攻撃を受けた数
    counterSuccess: {},     // 反撃成功数
    flowerGifts: {},        // 花の贈り物（0th等）
    apocalypseChain: {},    // 連鎖数
    lavaDestroyCount: {},   // 溶岩での破壊数
    hasContacted: {},       // 接触履歴
    wasCursed: {},          // 呪いを受けた履歴
    gateInvaded: {},        // ゲート侵攻履歴
    gateInvasionCount: {},  // ゲート侵攻回数
    handEffectUsedCount: {}, // 手札効果使用数
    firstCardUseCount: {},   // FIRSTカード使用数
    lockBreakCount: {}      // ★ここが漏れていた：ロック破壊・奪取数
};

    // --- 長期称号用：使用アイコン履歴の記録（P1のみ） ---
    const p1Icon = (window.pendingProfiles && window.pendingProfiles[0]) ? window.pendingProfiles[0].icon : userProfile.icon;
    if (!userProfile.usedIconPaths) userProfile.usedIconPaths = [];
    if (!userProfile.usedIconPaths.includes(p1Icon)) {
        userProfile.usedIconPaths.push(p1Icon);
    }

    // ライトモードの反映
    if (isLightMode) {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }

    // UI側のスイッチの状態も合わせる
    const toggle = document.getElementById('light-mode-toggle');
    if (toggle) toggle.checked = isLightMode;

    const preservedTestCards = isTest ? [...(testSelectedCards || [])] : null;

    /**
     * 2026/03/17 修正
     * ゲーム開始時に新ホーム画面を含む全てのメニューUIを強制的に非表示にする。
     */
    const menuUI = ['home-screen', 'title-overlay', 'setup-overlay', 'cpu-setup-overlay', 'test-mode-modal', 'profile-setup-modal'];
    menuUI.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('hidden');
            // クラスだけでなく直接スタイルでも非表示をダメ押し
            el.style.display = 'none'; 
        }
    });
     
    /** 2026/03/04 修正：cleanupGameによるリセット直後にHTMLから全設定を再ロードする **/
    cleanupGame(); 
    
    const tw = document.getElementById('timer-wrapper'); if(tw) tw.classList.remove('hidden'); 
    if (document.getElementById('my-lock-container')) document.getElementById('my-lock-container').classList.remove('hidden');
    if (document.getElementById('hand-area-container')) document.getElementById('hand-area-container').classList.remove('hidden');

    // --- HTMLの設定値を内部変数に完全同期（ここが生命線です） ---
    const timerToggle = document.getElementById('timer-mode-toggle');
    if (timerToggle) useGlobalTimer = timerToggle.checked;

    /** 2026/03/04 21:10 修正：CPU戦時の補充時間を確実に1秒に固定するよう修正 **/
    if (window.FORCED_CPU_MODE) {
        // --- CPU戦専用：固定設定 ---
        isP1TimerIgnored = true;
        isRandomLockOnTimeout = true;
        isAutoAction = true;
        isP1HandOnlyView = true;
        isSkipSelectionOnAuto = true;
        currentPhaseMaxTime = 15;
        window.PHASE_TIME_ADD = 1; 
        
        const pAddEl = document.getElementById('setting-phase-time-add');
        if (pAddEl) pAddEl.value = "1";
        addLog("[System] CPU戦モード：補充時間1秒を適用しました");
    } else {
        // --- 通常戦・テストモード：設定画面からリアルタイムに読み込み ---
        // ★修正ポイント：各フラグの読み込み先をHTMLのIDと厳密に一致させます
        isP1TimerIgnored = document.getElementById('setting-p1-timer-ignore')?.checked ?? false;
        isRandomLockOnTimeout = document.getElementById('setting-random-lock')?.checked ?? false;
        isAutoAction = document.getElementById('setting-auto-action')?.checked ?? false;
        
        // P1の手札のみ表示フラグ（変数名の不一致を修正：isP1HandOnlyView か isOnlyP1HandVisible か）
        const handOnlyEl = document.getElementById('setting-p1-hand-only');
        isP1HandOnlyView = handOnlyEl ? handOnlyEl.checked : false;

        /* 2026/03/14 追加：開発用ログの常時表示フラグを同期 */
        window.IS_DEV_LOG_FORCED = document.getElementById('setting-dev-log-always')?.checked ?? false;
        
        // 基本フェイズ秒数の反映
        const pTimeEl = document.getElementById('setting-phase-time');
        currentPhaseMaxTime = pTimeEl ? parseInt(pTimeEl.value) : 15;
        timeLeft = currentPhaseMaxTime; // 開始時のタイマーも同期

        // 補充時間の反映
        const pAddEl = document.getElementById('setting-phase-time-add');
        window.PHASE_TIME_ADD = pAddEl ? parseInt(pAddEl.value) : 15;
        
        addLog(`[System] 設定適用: 補充${window.PHASE_TIME_ADD}s / P1手札制限:${isP1HandOnlyView}`);
    }
    // 自動処理レベル(EASY/NORMAL)の同期
    const autoModeSelect = document.getElementById('setting-auto-mode');
    if (autoModeSelect) autoMode = autoModeSelect.value;
    
    // 【重要】ここで設定同期ブロック終了。これ以降に上書き処理がないことを確認。
    
    
    
    const initTime = parseInt(document.getElementById('setting-init-time')?.value || "0");

    // ★★★ 修正箇所：BGM実装（詳細ログ付き） ★★★
    console.log("BGM再生を試みます..."); 
    if (window.gameBGM) {
        window.gameBGM.pause();
        window.gameBGM = null;
    }
    
    // パスが正しいか確認してください（index.htmlから見た相対パス）
    window.gameBGM = new Audio('audio/bgm_main.mp3'); 
    window.gameBGM.loop = true;
    const bgmVolSlider = document.getElementById('setting-bgm-volume');
    window.gameBGM.volume = bgmVolSlider ? (parseInt(bgmVolSlider.value) / 100) : 0.3;

    // 再生を試行し、結果をログに出す
    window.gameBGM.play().then(() => {
        console.log("BGM再生成功！");
    }).catch(e => {
        console.error("BGM再生エラー詳細:", e);
        addLog(`[System] BGM再生に失敗しました。ファイルが存在するか確認してください。`);
    });
    // ★★★ 修正箇所ここまで ★★★


    const seats = num === 2 ? [SEATS.bottom, SEATS.top] : num === 3 ? [SEATS.bottom, SEATS.left, SEATS.top] : [SEATS.bottom, SEATS.left, SEATS.top, SEATS.right];
    eternalDeck = CARD_DATABASE.filter(d => d.type === 'ETERNAL').map(d => createCardInstance(d)).sort(() => Math.random() - 0.5); 
    const normalCandidates = CARD_DATABASE.filter(d => d.type === 'NORMAL'); 
    let deckArr = []; 

    // --- 既存の山札構築部分（if(!isTest) の中） ---
    if(!isTest) { 
        ['red','orange','yellow','green','blue','pink','purple'].forEach(col => {
            const colorNormals = normalCandidates.filter(d => d.colorId === col);
            colorNormals.forEach(c => {
                for(let i = 0; i < 7; i++) deckArr.push(createCardInstance(c));
            });
        });

        const rb = CARD_DATABASE.find(d => d.id === 29);
        for(let i = 0; i < 7; i++) deckArr.push(createCardInstance(rb));

        // ★修正箇所：無色カード不使用フラグをチェック
        const noColorless = document.getElementById('setting-no-colorless')?.checked;
        
        if (!noColorless) {
            // 通常時：白・黒カードを山札に追加
            const specialCounts = { 30: 2, 31: 2, 32: 1, 33: 1, 34: 1 };
            Object.keys(specialCounts).forEach(idStr => {
                const cardId = parseInt(idStr);
                const cardData = CARD_DATABASE.find(d => d.id === cardId);
                for(let i = 0; i < specialCounts[idStr]; i++) {
                    deckArr.push(createCardInstance(cardData));
                }
            });
        } else {
            // ONの時：ログに記録
            addLog(`<span class="text-gray-400">⚙️ 無色カード(白・黒)を除外して開始します</span>`);
        }

        deckArr.sort(() => Math.random() - 0.5); 
    } else {
        const pool = preservedTestCards && preservedTestCards.length > 0 ? preservedTestCards : [CARD_DATABASE.find(d=>d.id===29)];
        while(deckArr.length < 112) pool.forEach(c => { if(deckArr.length < 112) deckArr.push(createCardInstance(c)); });
        deckArr.sort(() => Math.random() - 0.5);
    }

    playerStats = {};
    
    // --- 既存コード（board生成の後、bCards確保の前あたり） ---
    // 一旦、空の盤面を作成
    board = []; 
    for (let y=0; y<GRID_SIZE; y++) { 
        const row=[]; for(let x=0; x<GRID_SIZE; x++) { row.push({ x, y, color: null, revealed: false, empty: true, stack: [] }); }
        board.push(row); 
    } 

    // 盤面用のカードを確保
    const bCards = [...deckArr].splice(0, 49); 
    deckArr.splice(0, 49); 
    deck = deckArr; 
    discardPile = []; 

    const shfCols = [...BASE_COLORS].sort(() => Math.random() - 0.5); 
    
    /* 2026/03/13 修正：観戦モード(P5作戦)の導入 */
    const isForcedCpu = (typeof window.FORCED_CPU_MODE !== 'undefined' && window.FORCED_CPU_MODE);

    players = seats.map((pos, i) => { 
        const pColor = (isTest && testFirstCards[i]) ? BASE_COLORS.find(bc => bc.id === testFirstCards[i].colorId) : shfCols[i]; 
        
        // 観戦モードならIDを 2,3,4,5 に設定。通常なら 1,2,3,4
        const assignedId = isForcedCpu ? (i + 2) : (i + 1);

        // プロフィール情報の取得
        const profile = (window.pendingProfiles && window.pendingProfiles[i]) ? window.pendingProfiles[i] : null;

        const player = { 
            id: assignedId, // ★ここが重要：1番を避ける
            x: pos.x, 
            y: pos.y, 
            startPos: {...pos}, 
            name: profile ? profile.name : `P${assignedId}`, 
            icon: profile ? profile.icon : `images/character_00${assignedId}.webp`,
            pieceImage: pColor.pieceImage, 
            color: pColor, 
            css: `${pColor.bg} border-2 border-white`, 
            extraMoves: 0, 
            baseMoveUsed: false, 
            viridianUsed: false, 
            serenadeUsed: false, 
            dimensionActive: false, 
            lockPrevented: false, 
            domusNeroUsed: false, 
            marmegoPenalty: false, 
            konohanaPenalty: false, 
            reactionSkip: false,
            totalTimeLeft: initTime, 
            timeoutStrikes: 0 
        }; 
        player.prevX = player.x; 
        player.prevY = player.y; 

        // CPU戦用のアイコン調整ロジック（assignedId を使用）
        if (assignedId > 1 && window.pendingProfiles && window.pendingProfiles[i]) {
            const colorMap = { 'red': 1, 'orange': 2, 'yellow': 3, 'green': 4, 'blue': 5, 'pink': 6, 'purple': 7 };
            const colorIdx = colorMap[player.color.id];
            if (colorIdx) {
                player.icon = `images/character_00${colorIdx}.webp`;
            }
        }

        return player; 
    });

    playerStats = {};
    players.forEach(p => {
        playerStats[p.id] = { moveCount: 0 };
    });

    

    turn = 0; currentPhase = PHASE.LOCK; winner = null; 
    collections = {}; hands = {}; invasionQueue = []; 
    players.forEach((p, idx) => {
        collections[p.id] = {};
        [...new Set(CARD_DATABASE.map(c => c.colorId))].forEach(cId => collections[p.id][cId] = []);
        hands[p.id] = [];
        
        const fCard = isTest && testFirstCards[idx] ? testFirstCards[idx] : CARD_DATABASE.find(d => d.type === 'FIRST' && d.colorId === p.color.id);
        if(fCard) collections[p.id][fCard.colorId].push(createCardInstance(fCard));

        // --- ブーストモード処理 ---
        const isBoostMode = document.getElementById('setting-boost-mode')?.checked;
        if (isBoostMode && fCard) {
            // BASE_COLORS から現在の色のインデックスを取得
            const colorIdx = BASE_COLORS.findIndex(c => c.id === fCard.colorId);
            if (colorIdx !== -1) {
                // 両隣のインデックスを計算（環状構造）
                const leftIdx = (colorIdx - 1 + BASE_COLORS.length) % BASE_COLORS.length;
                const rightIdx = (colorIdx + 1) % BASE_COLORS.length;
                const neighborColors = [BASE_COLORS[leftIdx].id, BASE_COLORS[rightIdx].id];

                neighborColors.forEach(colId => {
                    // 対応するブーストカードを探してロック
                    const bCardData = CARD_DATABASE.find(d => d.type === 'BOOST' && d.colorId === colId);
                    if (bCardData) {
                        collections[p.id][colId].push(createCardInstance(bCardData));
                        addLog(`${p.name}: ${bCardData.name}をブーストロック！`);
                    }
                });
            }
        }
        
        
        if (isTest && testInitialLocks[idx]) testInitialLocks[idx].forEach(lc => collections[p.id][lc.colorId].push(createCardInstance(lc)));
        
        if (isTest && preservedTestCards) {
            const countPerCard = parseInt(document.getElementById('test-card-count')?.value || "1");
            preservedTestCards.forEach(tc => {
                for (let i = 0; i < countPerCard; i++) {
                    hands[p.id].push(createCardInstance(tc));
                }
            });
        }
    });

    // ★ collections の初期化が完全に終わった「ここ」で呼び出す
    recordLockHistory();

    if (typeof generateUI === 'function') generateUI();

    // 盤面カードの順次配置アニメーション
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const cardData = bCards.pop() || createCardInstance(CARD_DATABASE.find(d => d.id === 29));
            board[y][x].color = cardData;
            board[y][x].empty = false;
            
            renderBoard(); 
            await new Promise(resolve => setTimeout(resolve, 30)); 
        }
    }

    // 【外科手術的修正】テストモード時は自動的なターン開始(startTurn)を徹底的にブロックする
    if (!isTest) {
        // 1. 全プレイヤーからランダムに先手を選択
        const startIndex = Math.floor(Math.random() * players.length);
        turn = startIndex; // グローバル変数の turn を更新
        
        const firstPlayer = players[startIndex];
        const msg = `<div class="flex flex-col items-center gap-4 animate-bounce">
            <span class="text-xs text-gray-400 font-bold tracking-[0.3em] uppercase">Starting Order</span>
            <div class="flex items-center gap-3 bg-white/10 px-6 py-3 rounded-full border border-white/20">
                <span class="text-2xl font-black text-yellow-400">1st</span>
                <img src="${firstPlayer.icon}" class="w-10 h-10 rounded-full border-2 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]">
                <span class="text-xl font-bold text-white">${firstPlayer.name}</span>
            </div>
        </div>`;

        // 2. メッセージを2秒表示してからロゴ→ゲーム開始へ
        showMessageOverlay(msg, 2000, () => {
            showOpeningLogo(startTurn);
        });
        
        addLog(`[System] 先手決定：<b>${firstPlayer.name}</b> からゲームを開始します。`);
    } else {
        // テストモード時はアニメーション完了のログだけ出し、
        // flowPos 側の制御（駒の配置待ち）に処理を明け渡す
        console.log("テストモード：盤面配置完了。配置待ちへ...");
    }
}

async function initGame(n) { 
    /* 2026/03/14 修正：通常対局時は観戦モードフラグを確実にオフにする */
    window.FORCED_CPU_MODE = false; 
    await initGameInternal(n); 
}

function showOpeningLogo(callback) {
    const logoOverlay = document.createElement('div');
    logoOverlay.className = "fixed inset-0 flex items-center justify-center logo-overlay-active";
    logoOverlay.innerHTML = `
        <img src="images/logo.webp" class="w-64 animate-logo-entrance shadow-[0_0_50px_rgba(234,179,8,0.4)]" alt="LOGO">
    `;
    document.body.appendChild(logoOverlay);

    if (typeof playSE === 'function') {
        playSE('se_title_impact.mp3'); 
    }

    setTimeout(() => {
        logoOverlay.style.transition = "opacity 0.8s ease";
        logoOverlay.style.opacity = "0";
        setTimeout(() => {
            logoOverlay.remove();
            if (callback) callback(); 
        }, 800);
    }, 2000);
}

/**
 * 2026/02/23 18:20 修正
 * START GAME ボタンから呼ばれる専用の関数。
 * ここで初めてプロフィール設定が必要かチェックします。
 */
/**
 * 修正日: 2026/03/05
 * 修正概要: プロフィールが一度設定されていれば、START GAME後に設定モーダルをスキップするように修正
 */
function openProfileSetup() {
    const hasSavedProfile = localStorage.getItem('shades_seven_profile');
    const isLoggedIn = userProfile && userProfile.isLoggedIn; // ログイン状態をチェック

    if (window.isProfileSet || hasSavedProfile || isLoggedIn) {
        window.isProfileSet = true;
        
        const titleEl = document.getElementById('title-overlay');
        const setupEl = document.getElementById('setup-overlay');
        const homeScreen = document.getElementById('home-screen');
        
        if (titleEl) titleEl.classList.add('hidden');
        if (setupEl) setupEl.classList.add('hidden'); // 人数設定は隠す

        if (homeScreen) {
            homeScreen.classList.remove('hidden');
            const nameDisplay = document.getElementById('home-user-name');
            if (nameDisplay) nameDisplay.textContent = userProfile.name;
        }
        return;
    }

    // まだ一度も設定していない場合のみプロフィールモーダルを表示
    const modal = document.getElementById('profile-setup-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        if (typeof setupProfileUI === 'function') setupProfileUI(); 
    }
}

function skipToPositionSelection() {
    if(!testSelectedCards || testSelectedCards.length === 0) { 
        showToast("テスト用の山札（カード）を1枚以上選んでください"); 
        return; 
    }
    const testEl = document.getElementById('test-mode-modal'); 
    if(testEl) testEl.classList.add('hidden');

    const firstCards = CARD_DATABASE.filter(c => c.type === 'FIRST');
    
    // ファーストカードをランダムに割り当て（初期ロック用）
    testFirstCards = [
        firstCards[Math.floor(Math.random() * firstCards.length)],
        firstCards[Math.floor(Math.random() * firstCards.length)]
    ];
    // 追加の初期ロックはなし
    testInitialLocks = [[], []];

    // ゲームの初期化を実行
    initGameInternal(2, true); 
    if(timerInterval) clearInterval(timerInterval); 
    
    // 駒を一時的に画面外へ
    players[0].x = -1; players[0].y = -1; 
    players[1].x = -1; players[1].y = -1; 
    renderBoard();

    // 駒の位置選択モードを開始
    startSelectionMode('select_cell', 1, 'test_pos_p1', "P1開始位置を選択", (sel) => { 
    players[0].x = sel[0].x; players[0].y = sel[0].y; 
    players[0].startPos = {...sel[0]}; 
    players[0].prevX = sel[0].x; players[0].prevY = sel[0].y; 
    renderBoard();
    startSelectionMode('select_cell', 1, 'test_pos_p2', "P2開始位置を選択", (sel2) => { 
        players[1].x = sel2[0].x; players[1].y = sel2[0].y; 
        players[1].startPos = {...sel2[0]}; 
        players[1].prevX = sel2[0].x; players[1].prevY = sel2[0].y; 
        addLog("テスト開始(一括スキップ)。"); 

        // --- 修正箇所：ロゴ演出を表示し、終わったらタイマーリセットと状態更新を行う ---
        showOpeningLogo(() => {
            resetTimer(); 
            updateGameState(); 
        });
        
    }, null, null, true, null, false, null, null, null, players[1]);
}, null, null, true, null, false, null, null, null, players[0]);
}

async function startTestGame() { 
    if(!testSelectedCards || testSelectedCards.length === 0) { showToast("カードを選んでください"); return; } 
    
    // 1. モーダルを隠す
    const testEl = document.getElementById('test-mode-modal'); 
    if(testEl) testEl.classList.add('hidden'); 
    
    // --- 【追加】テスト人数を選択させる ---
    const waitForNumber = () => {
        return new Promise((resolve) => {
            showSelectionModal("TEST PLAYERS", "テストする人数を選んでください", [
                { id: 2, name: "2人戦", type: "PLAYER_SELECT" },
                { id: 3, name: "3人戦", type: "PLAYER_SELECT" },
                { id: 4, name: "4人戦", type: "PLAYER_SELECT" }
            ], "card-back-pattern", 1, (result) => resolve(result[0].id));
        });
    };

    const playerNum = await waitForNumber();
    await new Promise(r => setTimeout(r, 400));

    const firstCards = CARD_DATABASE.filter(c => c.type === 'FIRST');
    const lockPool = CARD_DATABASE.filter(c => c.type === 'NORMAL' || c.type === 'ETERNAL'); 
    testFirstCards = []; 
    testInitialLocks = []; // 人数分用意するので初期化

    // 共通の選択ヘルパー
    const waitForSelection = (title, desc, source, back, count) => {
        return new Promise((resolve) => {
            showSelectionModal(title, desc, source, back, count, (result) => {
                resolve(result);
            }, false, () => {
                resolve([]);
            }, "ランダム/スキップ");
        });
    };

    // --- 【外科手術的進化】人数分ループで回す ---
    for (let i = 0; i < playerNum; i++) {
        const pName = `P${i + 1}`;
        
        // ファーストカード選択
        let selF = await waitForSelection(`${pName} FIRST`, `${pName}のファーストカードを選択`, firstCards, "card-back-pattern", 1);
        testFirstCards[i] = selF.length > 0 ? selF[0] : firstCards[Math.floor(Math.random() * firstCards.length)];
        await new Promise(r => setTimeout(r, 300));

        // 初期ロック選択
        testInitialLocks[i] = await waitForSelection(`${pName} LOCKS`, `${pName}の初期ロックを選択（最大7枚）`, lockPool, "card-back-pattern", 7);
        await new Promise(r => setTimeout(r, 300));
    }

    // --- 最終 Step: 盤面構築と駒配置 ---
    addLog(`${playerNum}人戦の盤面を構築中...`);
    
    // プレイヤー人数を渡して初期化
    await initGameInternal(playerNum, true); 
    
    if(timerInterval) clearInterval(timerInterval); 
    players.forEach(p => { p.x = -1; p.y = -1; });
    renderBoard();

    await new Promise(r => setTimeout(r, 800));

    // 全員の初期位置を順番に選ぶループ
    for (let i = 0; i < playerNum; i++) {
        const p = players[i];
        await new Promise((resolve) => {
            startSelectionMode('select_cell', 1, `test_pos_p${p.id}`, `${p.name}の開始位置を選択してください`, (sel) => {
                if (sel && sel.length > 0) {
                    p.x = sel[0].x; p.y = sel[0].y; p.startPos = {...sel[0]};
                    renderBoard();
                }
                resolve();
            }, null, null, true, null, false, null, null, null, p);
        });
        await new Promise(r => setTimeout(r, 300));
    }

    addLog("すべての準備が整いました。テスト開始！");
    showOpeningLogo(() => {
        resetTimer(); 
        updateGameState(); 
    });
}

function setupEventListeners() {
    // ...既存のリスナーの最後の方に追加
    
    // 設定ボタン
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.onclick = () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.remove('hidden');
        };
    }
}

function setupProfileUI() {
    const p1Container = document.getElementById('p1-icon-selector');
    const startBtn = document.getElementById('start-with-profile-btn');
    if (!p1Container || !startBtn) return;

    // 現在のアイコンを初期選択状態にする
    let selectedIcon = userProfile.icon || "images/character_001.webp"; 

    const renderIcons = () => {
        p1Container.innerHTML = '';
        // 8枚並ぶ可能性があるので、少し隙間を調整 (gap-1)
        p1Container.className = "flex flex-row justify-start w-full gap-1 px-1 overflow-x-auto pb-2 custom-scrollbar";
        
        // 1. 基本の7枚のパスを配列で作る
        let iconList = [];
        for (let i = 1; i <= 7; i++) {
            iconList.push(`images/character_00${i}.webp`);
        }

        // 2. ★追加：Googleログイン中なら、リストの最初（または最後）にGoogleアイコンを挿入
        if (userProfile.isLoggedIn && userProfile.icon && userProfile.icon.startsWith('http')) {
            // リストの先頭に追加（自分の顔が一番最初に来るように）
            if (!iconList.includes(userProfile.icon)) {
                iconList.unshift(userProfile.icon);
            }
        }

        // 3. 配列に基づいて描画
        iconList.forEach(iconPath => {
            const img = document.createElement('img');
            img.src = iconPath;
            
            // Googleアイコン(http...)の場合は少し特別な枠線にするなどの演出も可能
            const isGoogleIcon = iconPath.startsWith('http');
            
            img.className = `w-9 h-9 rounded-full border-2 cursor-pointer transition-all shrink-0 ${selectedIcon === iconPath ? 'border-yellow-500 scale-110 z-10' : 'border-transparent opacity-50'}`;
            
            if (isGoogleIcon) {
                img.classList.add('ring-1', 'ring-blue-400'); // Googleアイコンだと分かりやすく
            }

            img.onclick = () => {
                selectedIcon = iconPath;
                renderIcons();
            };
            p1Container.appendChild(img);
        });
    };
    renderIcons();


    startBtn.onclick = () => {
        const nameInput = document.getElementById('p1-name-input');
        const name1 = (nameInput && nameInput.value) ? nameInput.value : "P1";
        
        // --- 外科手術的追加：userProfile（永続データ）の更新 ---
        userProfile.name = name1;
        userProfile.icon = selectedIcon;
        saveUserProfile();           // localStorageへ保存
        updateProfileButtonVisual(); // UI上のボタン画像を更新

        // P1のみ設定、他はデフォルト
        window.pendingProfiles = [
            { name: name1, icon: selectedIcon },
            { name: "P2", icon: "images/character_002.webp" },
            { name: "P3", icon: "images/character_003.webp" },
            { name: "P4", icon: "images/character_004.webp" }
        ];
        window.isProfileSet = true;

        // 1. プロフィールモーダルを非表示
        const profileModal = document.getElementById('profile-setup-modal');
        if (profileModal) {
            profileModal.classList.add('hidden');
            profileModal.style.display = 'none';
        }

        // 2. タイトル画面（START GAMEがある画面）を隠す
        const titleOverlay = document.getElementById('title-overlay');
        if (titleOverlay) {
            titleOverlay.classList.add('hidden');
        }

        /** 2026/03/04 修正：ホーム表示時にセットアップ画面を完全に隠す **/
        // 3. ホーム画面を表示
        const homeScreen = document.getElementById('home-screen');
        const setupOverlay = document.getElementById('setup-overlay'); // 追加
        const nameDisplay = document.getElementById('home-user-name');
        
        if (nameDisplay) nameDisplay.textContent = name1;
        
        // 背後のセットアップ画面を隠し、ホーム画面を表示する
        if (setupOverlay) setupOverlay.classList.add('hidden'); // 追加：これで透けなくなります
        if (homeScreen) {
            homeScreen.classList.remove('hidden');
        }
    };
}

/**
 * 2026/03/05 15:15 新規追加
 * プロフィール編集専用の関数。
 * 保存してもホームに戻らず、詳細画面を再表示します。
 */
/**
 * 2026/03/08 10:00 修正
 * 1. openProfileEdit 内の変数名重複エラー(okBtnの再宣言)を修正。
 * 2. ボタンのクローンによるイベント初期化と、編集用ロジックの割り当てを正常化。
 */
function openProfileEdit() {
    const modal = document.getElementById('profile-setup-modal');
    if (!modal) return;

    // ★ 外科手術：1回目からアイコンを表示させるため、まずUIを構築する
    if (typeof setupProfileUI === 'function') {
        setupProfileUI();
    }

    // 1. ボタンのリセット（クローンによるイベント消去）
    let okBtn = document.getElementById('start-with-profile-btn');
    if (okBtn) {
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        okBtn = newOkBtn;
    }

    // 2. モーダルを表示
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    // 3. 現在の名前を入力欄にセット
    const nameInput = document.getElementById('p1-name-input');
    if (nameInput) {
        nameInput.value = userProfile.name; 
    }

    // 4. タイトルを「EDIT PROFILE」に変更
    const title = modal.querySelector('h2');
    if (title) title.textContent = "EDIT PROFILE";

    // 5. 書き換えた「新品のボタン」に編集用の動きを割り当てる
    if (okBtn) {
        okBtn.textContent = "保存して戻る";

        okBtn.onclick = () => {
            const newName = (nameInput && nameInput.value) ? nameInput.value : userProfile.name;
            
            // アイコンは現在選択されているものを取得
            const selectedImg = modal.querySelector('#p1-icon-selector img.border-yellow-500');
            const iconPath = selectedImg ? selectedImg.src : userProfile.icon;

            // データの保存と反映
            userProfile.name = newName;
            userProfile.icon = iconPath;
            
            if (typeof saveUserProfile === 'function') saveUserProfile();
            if (typeof updateProfileButtonVisual === 'function') updateProfileButtonVisual();

            // モーダルを閉じる
            modal.classList.add('hidden');
            modal.style.display = 'none';

            // プロフィール詳細画面を再表示
            showUserProfileModal();

            // 次回（新規登録時など）のためにボタンとタイトルを初期化
            okBtn.textContent = "OK";
            if (title) title.textContent = "PLAYER SETUP";
            
            if (typeof setupProfileUI === 'function') setupProfileUI();
        };
    }
}

// --- 追加箇所：game_core.js の任意の場所（末尾などでOK） ---
function pauseTimer() {
    isTimerPaused = true;
}

function resumeTimer() {
    isTimerPaused = false;
}

/**
 * 2026/02/24 17:35 修正
 * 1. P1手札固定設定のリスナーをグローバルに追加
 */
document.addEventListener('DOMContentLoaded', () => {
    const p1HandOnlyInput = document.getElementById('setting-p1-hand-only');
    if (p1HandOnlyInput) {
        p1HandOnlyInput.addEventListener('change', (e) => {
            isP1HandOnlyView = e.target.checked;
            if (typeof renderHand === 'function') renderHand(); 
            if (typeof addLog === 'function') addLog(isP1HandOnlyView ? "デバッグ：P1手札固定表示 ON" : "デバッグ：P1手札固定表示 OFF");
        });
    }
});

function recordLockHistory() {
    if (!players || players.length === 0) return;
    const currentCounts = players.map(p => {
        // 安全装置：collections[p.id] が無ければ 0 を返す
        if (!collections || !collections[p.id]) return 0;

        return LOCK_ORDER.filter(col => {
            const slot = collections[p.id][col.id];
            // slot 自体の存在チェックも追加
            return slot && slot.length > 0 && 
                   slot.some(c => c.colorId !== 'white' && c.colorId !== 'black') && 
                   !slot.some(c => c.id === 34);
        }).length;
    });
    lockHistory.push(currentCounts);
}

/** 2026/03/09 修正：エターナル関連の称号判定ロジックを追加 **/
function calculateAwards(winnerId) {
    const awards = [];
    if (!players || players.length === 0) return awards;

    const winner = players.find(p => p.id === winnerId);

    // --- [新規] ラスト・エターニティの判定 ---
    if (winner && winner.lastLockedCardType === "ETERNAL") {
        awards.push({ pid: winnerId, name: "💎 ラスト・エターニティ", desc: "永遠のカードで勝利を確約せし者" });
    }

    // --- [新規] ゲート侵攻回数（エターナラー系）の累計判定 ---
    if (winnerId === 1) { // P1（自分）のみプロフィールに反映
        const count = userProfile.totalEternalGets || 0;
        if (count >= 7) awards.push({ pid: 1, name: "🏆 レジェンド・エターナラー", desc: "七つの門を越えし伝説" });
        else if (count >= 3) awards.push({ pid: 1, name: "⚔️ エターナラー", desc: "禁断の力を集めし実力者" });
        else if (count >= 1) awards.push({ pid: 1, name: "👣 静かなる侵攻者", desc: "境界を越えた新鋭の足跡" });
    }

    // --- 外科手術的修正：プレイヤー数に応じたボーダー（人数×7ターン）を算出 ---
    const turnThreshold = players.length * 7;

    // 1. 電光石火 (Lightning Fast)
    if (totalTurnCount <= turnThreshold) {
        awards.push({ pid: winnerId, name: "⚡ 電光石火", desc: `${turnThreshold}ターン以内の電撃決着` });
    }

    /** 2026/03/10 修正：不動の精神を「最小移動で勝利した勝者」限定に変更 **/
    // 2. 韋駄天 & 不動の精神 の基礎データ算出
    let maxDist = -1, fastestId = null;
    let minDist = Infinity, slowestId = null;
    let maxTypes = -1, collectorId = null;

    players.forEach(p => {
        const d = (playerStats[p.id] && playerStats[p.id].moveCount) || 0;
        // 最長距離の特定
        if (d > maxDist) { maxDist = d; fastestId = p.id; }
        // 最短距離の特定
        if (d < minDist) { minDist = d; slowestId = p.id; }

        const stats = cardUsageStats[p.id] || {};
        const typesCount = Object.keys(stats).length;
        if (typesCount > maxTypes) { maxTypes = typesCount; collectorId = p.id; }
    });

    // 韋駄天：最長距離を走ったのが「勝者」かつターン制限以内
    if (fastestId === winnerId && totalTurnCount <= turnThreshold) {
        awards.push({ pid: winnerId, name: "👟 韋駄天", desc: `${turnThreshold}ターン以内に戦場を最も駆け抜けた` });
    }

    // 不動の精神：最短距離なのが「勝者」である場合のみ授与
    if (slowestId === winnerId) {
        awards.push({ pid: winnerId, name: "🧘 不動の精神", desc: "一歩も無駄にせぬ支配で勝利を掴んだ" });
    }

    /** 2026/03/10 修正：カード愛好家の条件を14種類（カード名ベース）に強化 **/
    if (collectorId === winnerId && maxTypes >= 14) {
        awards.push({ 
            pid: winnerId, 
            name: "📚 カード愛好家", 
            desc: "14種以上のカードを駆使して戦場を支配した証" 
        });
    }

    // 4. 特定色のスペシャリスト & 5. 一点突破
    const wStats = cardUsageStats[winnerId] || {};
    const cardEntries = Object.entries(wStats);

    // 【外科手術的修正】エターナルカードも確実に CARD_DATABASE から検索して統計に含める
    if (cardEntries.length > 0) {
        // 最多使用カード（MVP）の特定
        let topCard = null;
        let maxCount = 0;

        cardEntries.forEach(([name, count]) => {
            if (count > maxCount) {
                maxCount = count;
                topCard = CARD_DATABASE.find(d => d.name === name);
            }
        });

        if (topCard) {
            // MVP情報を stats に保存（プロフ画面用）
            userProfile.stats.mvpCard = topCard.name;
        }
        // 一点突破
        const totalUsages = cardEntries.reduce((a, b) => a + b[1], 0);
        const avgUsage = totalUsages / cardEntries.length;
        for (const [name, count] of cardEntries) {
            if (count >= avgUsage * 3 && count >= 3) {
                awards.push({ pid: winnerId, name: "🎯 一点突破", desc: `「${name}」を極めし者` });
                break;
            }
        }
        /** 2026/03/09 修正：色ごとの「愛好家」勲章を判定 **/
        const colorUsage = {};
        BASE_COLORS.forEach(c => colorUsage[c.id] = 0);
        cardEntries.forEach(([name, count]) => {
            const data = CARD_DATABASE.find(d => d.name === name);
            if (data && colorUsage[data.colorId] !== undefined) colorUsage[data.colorId] += count;
        });

        for (const [colId, count] of Object.entries(colorUsage)) {
            // その色のカードを3回以上使用、かつその試合での最多使用色であれば「愛好家」
            const isMostUsedColor = Object.values(colorUsage).every(v => count >= v);
            if (count >= 3 && isMostUsedColor) {
                const cName = BASE_COLORS.find(bc => bc.id === colId).name;
                awards.push({ pid: winnerId, name: `✨ ${cName}の愛好家`, desc: `${cName}のカードを最も愛用した` });
                // 一番多い色を1つ取ったら抜ける
                break;
            }
        }
    }

    // 6. 逆転の覇者 & 堅実な守り手
    if (lockHistory && lockHistory.length >= 4) {
        const wIdx = players.findIndex(p => p.id === winnerId);
        let alwaysFirst = true, wasLastFirstHalf = false;
        const mid = Math.floor(lockHistory.length / 2);
        lockHistory.forEach((counts, tIdx) => {
            const wC = counts[wIdx], maxC = Math.max(...counts), minC = Math.min(...counts);
            if (wC < maxC) alwaysFirst = false;
            if (tIdx <= mid && wC === minC && counts.some(c => c > minC)) wasLastFirstHalf = true;
        });
        if (alwaysFirst) awards.push({ pid: winnerId, name: "🛡️ 堅実な守り手", desc: "一度も首位を譲らぬ完封" });
        else if (wasLastFirstHalf) awards.push({ pid: winnerId, name: "🔄 逆転の覇者", desc: "絶望から這い上がった伝説" });
    }
    
    // 7. 虹の覇者 (Rainbow Master) ★2026/03/09 新条件適用
    if (winner) {
        // 勝者の全ロックエリアをフラットな配列にして、カード名が「なないろの欠片」のものを抽出
        const lockedFragments = Object.values(collections[winnerId] || {})
            .flat()
            .filter(card => card && card.name === "なないろの欠片");

        if (lockedFragments.length >= 7) {
            awards.push({ 
                pid: winnerId, 
                name: "🌈 虹の覇者", 
                desc: "「なないろの欠片」を七つ揃えし伝説の証" 
            });
        }
    }

    // --- 1. バトル・テクニカル系 ---
    // カウンター・ストライク
    if ((matchStats.counterSuccess[winnerId] || 0) >= 2) {
        awards.push({ pid: winnerId, name: "⚔️ カウンター・ストライク", desc: "1試合に2回以上の反撃を成功" });
    }

    // 無慈悲な強奪者
    if ((matchStats.stolenCount[winnerId] || 0) >= 5) {
        awards.push({ pid: winnerId, name: "🧤 無慈悲な強奪者", desc: "相手から合計5枚以上のカードを強奪" });
    }

    // デッドヒート（全員が残り1色の状態で勝利）
    const isDeadHeat = players.every(pl => {
        const count = LOCK_ORDER.filter(col => collections[pl.id][col.id].length > 0).length;
        return count >= 6;
    });
    if (isDeadHeat && winner) {
        awards.push({ pid: winnerId, name: "🔥 デッドヒート", desc: "全員がリーチ状態の極限戦を制した" });
    }

    // --- 2. カード・コンボ系 ---
    // 予言の完成者
    if ((matchStats.apocalypseChain[winnerId] || 0) >= 3) {
        awards.push({ pid: winnerId, name: "🔮 予言の完成者", desc: "アポカリプスを3回連続で的中" });
    }

    // ワイナウエアの怒り
    if ((matchStats.lavaDestroyCount[winnerId] || 0) >= 10) {
        awards.push({ pid: winnerId, name: "🌋 ワイナウエアの怒り", desc: "火山で10枚以上のカードを灰にした" });
    }

    // レインボー・メーカー
    const fragCount = Object.values(collections[winnerId] || {}).flat().filter(c => c.name === "なないろの欠片").length;
    if (fragCount >= 3) {
        awards.push({ pid: winnerId, name: "🌈 レインボー・メーカー", desc: "「なないろの欠片」を3枚以上ロック" });
    }

    // --- 3. プレイスタイル・特殊系 ---
    // 平和の使者（一度も接触による強奪を行わずに勝利）
    if (!matchStats.hasContacted[winnerId]) {
        awards.push({ pid: winnerId, name: "🕊️ 平和の使者", desc: "一度も相手からカードを奪わず勝利" });
    }

    // ラッキーセブン（7の倍数ターンで勝利）
    if (totalTurnCount > 0 && totalTurnCount % 7 === 0) {
        awards.push({ pid: winnerId, name: "🎰 ラッキーセブン", desc: `${totalTurnCount}ターン目、運命の数字で勝利` });
    }

    // 博愛主義
    if ((matchStats.flowerGifts[winnerId] || 0) >= 3) {
        awards.push({ pid: winnerId, name: "🌸 博愛主義", desc: "相手に3回以上カードをプレゼントした" });
    }

    // 呪いからの生還
    // （ロックエリアにID:34が1枚以上あった形跡があり、且つ勝利時に呪いが0枚の場合）
    const currentCurses = Object.values(collections[winnerId]).flat().filter(c => c.id === 34).length;
    if (matchStats.wasCursed && matchStats.wasCursed[winnerId] && currentCurses === 0) {
        awards.push({ pid: winnerId, name: "✨ 呪いからの生還", desc: "呪いをすべて振り払って勝利" });
    }

    // --- 不落のゲートキーパーの判定 ---
    // ゲート突破フラグ(gateInvaded)が立っていない勝者なら獲得
    if (winner && (!matchStats.gateInvaded || !matchStats.gateInvaded[winnerId])) {
        awards.push({ pid: winnerId, name: "🛡️ 不落のゲートキーパー", desc: "一度もゲートへの侵入を許さず完全勝利" });
    }

    /** 2026/03/09 修正：長期累計称号の最終判定ロジック **/
    if (winnerId === 1) { // 累計称号はプレイヤー1（自分）の統計を参照
        
        // --- 1. 七色の旅人 (全プレイヤーアイコンを一度は使用) ---
        // 選択可能なアイコン数（例: 8種類）に対して、使用済みのパス数を比較
        // ここでは便宜上 4種類以上としていますが、実際のアイコン数に合わせて調整可能です
        if (userProfile.usedIconPaths && userProfile.usedIconPaths.length >= 4) {
            awards.push({ pid: 1, name: "🌈 七色の旅人", desc: "様々な姿で戦場を渡り歩いた旅の記録" });
        }

        // --- 2. 歴戦の勇士 (通算対局数 100回) ---
        if (userProfile.stats && userProfile.stats.totalGames >= 100) {
            awards.push({ pid: 1, name: "🎖️ 歴戦の勇士", desc: "百戦錬磨の経験を持つ真の戦士" });
        }

        // --- 3. 0thの理解者 (全カード ID 1〜34 を一度は使用) ---
        // 重複を除いた使用済みID数が 34 に達しているかチェック
        if (userProfile.usedCardIds && userProfile.usedCardIds.length >= 34) {
            awards.push({ pid: 1, name: "📖 0thの理解者", desc: "全34種のカードの真髄を極めし賢者" });
        }
        
        /** 2026/03/10 修正：未定義変数 p を winner に差し替え **/
        // --- 4. スカイ・ウォーカー (ディメンションとダッシュを併用) ---
        if (winner && winner.dimensionActive && winner.extraMoves > 0) {
            awards.push({ pid: 1, name: "🚀 スカイ・ウォーカー", desc: "次元と速度を支配し戦場を舞った" });
        }
    }


    /** 2026/03/09 修正：追加称号の最終判定 **/
    // --- 1. 被侵攻系 ---
    const invasionCount = matchStats.gateInvasionCount[winnerId] || 0;
    if (winner && invasionCount >= 5) awards.push({ pid: winnerId, name: "🏰 名高き聖域", desc: "5回以上侵入されながらも勝利" });
    else if (winner && invasionCount >= 3) awards.push({ pid: winnerId, name: "🏠 オープンハウス", desc: "3回以上侵入されながらも勝利" });
    else if (winner && invasionCount >= 1) awards.push({ pid: winnerId, name: "🛡️ 不屈の防衛線", desc: "侵入を許しながらも戦い抜いた証" });
    
    if (invasionCount >= 4) awards.push({ pid: winnerId, name: "💂 鉄の門番（自称）", desc: "何度も突破されたが心は折れず" });

    // --- 2. 無為自然 (一度も手札効果を使わなかった勝者) ---
    if (winner && (matchStats.handEffectUsedCount[winnerId] || 0) === 0) {
        awards.push({ pid: winnerId, name: "🧘 無為自然", desc: "一切の小細工なしに勝利を掴んだ" });
    }

    // --- 3. 国宝の使い手 (ファーストカードを一番多く使った勝者) ---
    const myFirstCount = matchStats.firstCardUseCount[winnerId] || 0;
    if (winner && myFirstCount >= 3) {
        awards.push({ pid: winnerId, name: "💎 国宝の使い手", desc: "ファーストカードを最大限に愛用した" });
    }

    // --- 4. ロック・ブレイカー ---
    if ((matchStats.lockBreakCount[winnerId] || 0) >= 3) {
        awards.push({ pid: winnerId, name: "🔨 ロック・ブレイカー", desc: "相手のロックを3枚以上粉砕・強奪した" });
    }

    return awards;
}

/**
 * 勝利演出の後にUI（おめでとう画面）を表示する
 */
function showVictoryUI(pid) {
    // ★追加：念のため、盤面の回転と拡大をここで完全にリセットする
    const appEl = document.getElementById('app');
    if (appEl) {
        appEl.style.transform = "none";
        appEl.classList.remove('final-v-zoom-active');
    }

    const winnerPl = players.find(p => p.id === pid);
    const overlay = document.getElementById('winner-overlay');
    const nameEl = document.getElementById('winner-name');
    const statsDisplay = document.getElementById('winner-stats-display');
    const lockDisplay = document.getElementById('winner-lock-display');

    /* --- 2026/03/11 修正：勝敗に応じたタイトル表示の切り替え --- */
    if (nameEl) {
        if (Number(pid) === 1) {
            // 自分が勝った場合
            nameEl.textContent = "VICTORY!";
            nameEl.className = "text-3xl font-black mb-2 text-yellow-500 animate-bounce";
        } else {
            // CPUが勝った場合
            nameEl.textContent = "DEFEAT...";
            nameEl.className = "text-3xl font-black mb-2 text-blue-500";
        }
        
        // その下に勝者の名前を小さく表示
        const winnerSubText = document.createElement('div');
        winnerSubText.className = "text-sm font-bold opacity-80 mb-2";
        winnerSubText.textContent = `${winnerPl.name} has conquered the board.`;
        nameEl.after(winnerSubText);
    }

    // --- アワード（勲章）の表示 ---
    if (statsDisplay) {
        const awards = calculateAwards(winnerPl.id);
        
        /** 2026/03/05 修正: ライト/ダークの判定に基づいた背景色と文字色の割り振りを反転修正 **/
        const cardBg = isLightMode ? 'bg-white/90 border-gray-200' : 'bg-black/40 backdrop-blur-md border-white/10';
        const titleColor = isLightMode ? 'text-gray-900' : 'text-white';
        const descColor = isLightMode ? 'text-gray-600' : 'text-gray-300';
        const nameColor = isLightMode ? 'text-blue-600' : 'text-yellow-400';

        statsDisplay.innerHTML = `
            <div class="grid grid-cols-3 gap-2 mt-4 px-2 justify-items-center">
                ${awards.map(a => {
                    const p = players.find(pl => pl.id === a.pid);
                    const isWinner = p.id === winnerPl.id;
                    return `
                        <div class="flex flex-col items-center ${cardBg} p-2 rounded-lg border ${isWinner ? 'border-yellow-500' : ''} shadow-xl w-full max-w-[100px]">
                            <span class="text-[8px] ${isWinner ? nameColor : 'text-gray-400'} font-bold mb-1 truncate w-full text-center">${p.name}</span>
                            <span class="text-[10px] font-black ${titleColor} text-center leading-tight">${a.name}</span>
                            <span class="text-[7px] ${descColor} mt-1 text-center leading-none italic">${a.desc}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // --- ロックエリアの表示 ---
    if (lockDisplay) {
        lockDisplay.innerHTML = '';
        LOCK_ORDER.forEach(colorBase => {
            const cardInLock = collections[winnerPl.id][colorBase.id];
            const slot = document.createElement('div');
            slot.className = `w-10 h-10 rounded border border-white/40 flex items-center justify-center text-[8px] font-bold shadow-lg overflow-hidden relative victory-glow`;
            
            if (cardInLock && cardInLock.length > 0) {
                const card = cardInLock[cardInLock.length - 1];
                const imgPath = card.image || `images/card_${card.id}.webp`;
                slot.style.backgroundImage = `url('${imgPath}')`;
                slot.style.backgroundSize = 'cover';
            } else {
                slot.className += " bg-gray-900 opacity-20";
            }
            lockDisplay.appendChild(slot);
        });
    }

    // 最後に画面を表示！
    if (overlay) overlay.classList.remove('hidden');

    // ★重要：リザルト画面への遷移ボタンを確実に再接続する
    const winBtn = overlay.querySelector('button');
    if (winBtn) {
        winBtn.textContent = "リザルトを確認";
        winBtn.onclick = () => {
                overlay.classList.add('hidden');
                
                // 1. 色ごとの使用回数を集計 (colorStats の復元)
                const colorResults = BASE_COLORS.map(bc => {
                    let totalCount = 0;
                    // 全プレイヤーの使用スタッツから、その色のカードを探して合算
                    Object.values(cardUsageStats).forEach(pStats => {
                        Object.entries(pStats).forEach(([cardName, count]) => {
                            const cardData = CARD_DATABASE.find(d => d.name === cardName);
                            if (cardData && cardData.colorId === bc.id) totalCount += count;
                        });
                    });
                    return { id: bc.id, name: bc.name, bg: bc.bg, hex: bc.hex, count: totalCount };
                });

                // 2. MVPカードの選定 (最も多く使われたカード)
                let mvpName = "なし";
                let maxUsage = 0;
                Object.values(cardUsageStats).forEach(pStats => {
                    Object.entries(pStats).forEach(([cardName, count]) => {
                        if (count > maxUsage) {
                            maxUsage = count;
                            mvpName = cardName;
                        }
                    });
                });

                // 3. リザルトモーダルの呼び出し
                /** 2026/03/05 13:15 修正：リザルト表示後、画面が閉じられるタイミングでランク表示を行う **/
                if (typeof showResultModal === 'function') {
                    showResultModal(pid, {
                        time: window.currentPlayTime || 0,
                        turns: totalTurnCount,
                        colorStats: colorResults,
                        lockHistory: lockHistory,
                        mvp: mvpName
                    });

                    /** 2026/03/05 13:35 修正：リザルト→ランク→タイトルの遷移を完全保証 **/
                if (typeof showResultModal === 'function') {
                    showResultModal(pid, {
                        time: window.currentPlayTime || 0,
                        turns: totalTurnCount,
                        colorStats: colorResults,
                        lockHistory: lockHistory,
                        mvp: mvpName
                    });

                    /* 2026/03/12 修正：試合終了後にトップに戻らずホーム画面へ遷移させる */
                    const resultCloseBtn = document.getElementById('close-result-btn');
                    if (resultCloseBtn) {
                        resultCloseBtn.onclick = () => {
                            document.getElementById('result-overlay').classList.add('hidden');
                            
                            // 共通の「ホームへ戻る」処理
                            const returnToHome = () => {
                                cleanupGame(); // ゲーム変数をリセット
                                const home = document.getElementById('home-screen');
                                if (home) {
                                    home.classList.remove('hidden');
                                    document.getElementById('title-overlay')?.classList.add('hidden');
                                } else {
                                    location.reload(); // ホーム画面がない場合のみフォールバック
                                }
                            };

                            if (window.pendingRankUpdate) {
                                const { isWin, oldPoint, newPoint } = window.pendingRankUpdate;
                                showPostGameRankModal(isWin, oldPoint, newPoint, () => {
                                    if (window.pendingLevelUpdate) {
                                        showPostGameLevelModal(window.pendingLevelUpdate, returnToHome);
                                        window.pendingLevelUpdate = null;
                                    } else {
                                        returnToHome();
                                    }
                                });
                                window.pendingRankUpdate = null;
                            } else {
                                returnToHome();
                            }
                        };
                    }
                }
                }
            };
    }

    const peekBtn = document.getElementById('peek-board-container');
    if (peekBtn) peekBtn.classList.remove('hidden');
}


/**
 * ゲーム終了後のプロフィール更新処理
 * @param {string} winnerId - 勝利したプレイヤーのID
 */
/** 2026/03/05 10:35 修正：winnerId が数値(1)で渡されるケースに対応し、自分の勝利を正しく判定 **/
function updateProfileAfterGame(winnerId) {
    // 確実に最新のプロフィールをロードしてから更新を開始する
    if (typeof loadUserProfile === 'function') loadUserProfile();

    const isWin = (Number(winnerId) === 1); 
    const oldPoint = userProfile.rankPoint; // 変動前のポイントを記憶

    // 統計の基本更新（総試合数）
    userProfile.stats.totalGames++;

    /** 2026/03/05 11:45 修正：獲得ポイントの表示数値を実際の加算値と同期 **/
    let pointGained = 0; // 今回獲得（または減少）したポイント

    if (isWin) {
        userProfile.totalWins++;
        // ランク3以下は2pt、それ以外は1pt
        pointGained = (userProfile.rank <= 3) ? 2 : 1;
        userProfile.rankPoint += pointGained;

        /** 2026/03/05 14:10 修正：ランクアップ演出の実行タイミングを遅延させるための変更 **/
        if (userProfile.rankPoint >= 7 && userProfile.rank < 8) {
            userProfile.rank++;
            userProfile.rankPoint = 0; 
            addLog(`【RANK UP】ランク ${userProfile.rank} に到達しました！`);
            
            // 演出用データをwindowオブジェクトに予約（後でゲージ満タン時に使用）
            const rankNames = ["なし", "Red Apprentice", "Orange Survivor", "Yellow Seeker", "Green Guardian", "Blue Tactician", "Pink Specialist", "Purple Master", "SEVEN"];
            window.pendingRankUpEffect = { type: 'RANK', value: rankNames[userProfile.rank] };
        }

        // --- レベルの計算 (累積勝利数ベース) ---
        // 公式: レベル = floor(sqrt(累計勝利数 * 2)) + 1
        /** 2026/03/05 14:40 修正：レベルアップ演出を即時実行せず、進捗ゲージ表示用に予約 **/
        const oldLevel = userProfile.level;
        const newLevel = Math.floor(Math.sqrt(userProfile.totalWins * 2)) + 1;
        
        // 次のレベルに必要な累積勝利数を逆算 (n = ceil((L^2)/2))
        const getRequiredWins = (lv) => Math.ceil((Math.pow(lv, 2)) / 2);
        const currentExp = userProfile.totalWins;
        const nextLvExp = getRequiredWins(newLevel);
        const prevLvExp = getRequiredWins(oldLevel);

        window.pendingLevelUpdate = {
            oldLevel,
            newLevel,
            currentWins: currentExp,
            neededWins: nextLvExp,
            baseWins: prevLvExp,
            isLevelUp: newLevel > oldLevel
        };

        if (newLevel > oldLevel) {
            userProfile.level = newLevel;
            addLog(`【LEVEL UP】Lv.${newLevel} になりました！`);
        }
    } else {
        userProfile.rankPoint = Math.max(0, userProfile.rankPoint - 1);
    }

    /** 2026/03/05 11:15 修正：演出用モーダルに渡す勝敗フラグを isWin に固定 **/
    /** 2026/03/05 13:10 修正：ランクモーダルの自動表示を停止。リザルト後に表示するためデータをwindowに保管 **/
    const newPoint = userProfile.rankPoint;
    window.pendingRankUpdate = { isWin, oldPoint, newPoint }; // リザルト終了時に使うためのデータを一時保存


    /** 2026/03/10 修正：Color Style（カラー傾向）が集計されないバグを修正 **/
    
    // 1. 集計用データの準備
    if (!userProfile.stats.colorUsage) userProfile.stats.colorUsage = {};
    const p1Stats = window.cardUsageStats ? (window.cardUsageStats[1] || window.cardUsageStats['p1']) : null;

    if (p1Stats) {
        for (const cardName in p1Stats) {
            const cardData = CARD_DATABASE.find(c => c.name === cardName);
            if (cardData && cardData.colorId) {
                // 使用回数を数値として加算
                const useCount = Number(p1Stats[cardName]) || 0;
                userProfile.stats.colorUsage[cardData.colorId] = (userProfile.stats.colorUsage[cardData.colorId] || 0) + useCount;
            }
        }
        console.log("Color Style Updated:", userProfile.stats.colorUsage);
    }

    // --- ここで称号判定やMVP特定を既に行っているはずなので、最後に一度だけ保存 ---
    saveUserProfile();
    console.log("All Profile Stats Saved.");

    // データの保存（game_state.jsで定義した関数を呼び出し）
    // --- 外科手術的修正：新しく獲得した称号を保存する ---
    // 称号獲得の判定： pid が数値の 1 か、文字列の 'p1' かを両方許容する
    const currentAwards = calculateAwards(winnerId);
    currentAwards.forEach(award => {
        const isMyAward = (award.pid === 1 || award.pid === 'p1');
        if (isMyAward && !userProfile.unlockedTitles.includes(award.name)) {
            userProfile.unlockedTitles.push(award.name);
            addLog(`🎖️ 新しい称号「${award.name}」を獲得しました！`);
        }
    });

    // --- 外科手術的修正：通算MVPカードの特定 ---
    // MVPカードの判定：今回の対局結果をマージする前に、stats構造が存在するか確認
    if (!userProfile.stats) userProfile.stats = {};
    if (!userProfile.stats.cardUsageCount) userProfile.stats.cardUsageCount = {};

    // --- カラー傾向(Color Style)の更新箇所 ---
    if (window.cardUsageStats) {
        // IDが 1 (数値) または 'p1' (文字列) のどちらでも取得できるように修正
        const p1Usage = window.cardUsageStats[1] || window.cardUsageStats['p1'];
        if (p1Usage) {
            for (const cardName in p1Usage) {
                const card = CARD_DATABASE.find(c => c.name === cardName);
                if (card && card.colorId) {
                    userProfile.stats.colorUsage[card.colorId] = (userProfile.stats.colorUsage[card.colorId] || 0) + p1Usage[cardName];
                }
            }
        }
    }

    /* 2026/03/12 修正：MVP通算回数が反映されない不具合を修正 */
    // 1. 構造の初期化を徹底
    /* 2026/03/13 修正：通算MVPカードと使用回数の同期を確実に実行 */
    // 1. 構造の初期化を徹底（データ消失防止）
    if (!userProfile.stats) userProfile.stats = {};
    if (!userProfile.stats.cardUsageCount) userProfile.stats.cardUsageCount = {};
    if (!userProfile.stats.colorUsage) userProfile.stats.colorUsage = {};

    // 2. 今回の対局データ(p1Usage)を「通算」に確実に加算
    const p1MatchStats = window.cardUsageStats ? (window.cardUsageStats[1] || window.cardUsageStats['p1']) : null;
    
    if (p1MatchStats) {
        for (const cardName in p1MatchStats) {
            const matchCount = Number(p1MatchStats[cardName]) || 0;
            // 加算（既存がなければ 0 からスタート）
            userProfile.stats.cardUsageCount[cardName] = (Number(userProfile.stats.cardUsageCount[cardName]) || 0) + matchCount;

            // 通算カラー傾向もあわせて加算
            const cardData = CARD_DATABASE.find(c => c.name === cardName);
            if (cardData && cardData.colorId) {
                userProfile.stats.colorUsage[cardData.colorId] = (Number(userProfile.stats.colorUsage[cardData.colorId]) || 0) + matchCount;
            }
        }
    }

    // 3. 「加算済み」の通算データから、改めてトップ（MVP）を特定
    let topCardName = userProfile.stats.mvpCard || null;
    let maxUsageVal = -1;

    // 通算カード使用履歴をループ
    const totalHistory = userProfile.stats.cardUsageCount;
    for (const name in totalHistory) {
        const usage = Number(totalHistory[name]);
        if (usage > maxUsageVal) {
            maxUsageVal = usage;
            topCardName = name;
        }
    }
    
    // 4. 特定されたMVPと回数を確定反映
    if (topCardName) {
        userProfile.stats.mvpCard = topCardName;
        // console.log(`[MVP Sync] ${topCardName} (Total: ${maxUsageVal}回)`);
    }
    
    /* 2026/03/17 修正：未定義の変数 overallMaxCount を maxUsageVal に修正し、リファレンスエラーを解消 */
    // 5. ローカルに保存
    saveUserProfile();
    
    // 特定された最高使用回数(maxUsageVal)を使用してログを出力
    console.log(`[Stats Update] MVP: ${userProfile.stats.mvpCard}, Total: ${maxUsageVal}回`);

    // 6. クラウドに同期（ログイン済みの場合のみ内部で実行されます）
    if (typeof syncProfileToCloud === 'function') {
        syncProfileToCloud();
    }
}

/**
 * 2026/03/08 01:05 修正
 * 1. AI強制再起動用関数 forceResumeAI を追加。
 * 2. 停止原因となるフラグ(isAutoProcessing等)を強制リセットし、フェイズに応じたAIルーチンを再点火する。
 */

// --- 修正箇所：ファイルの最後の方（checkWin関数の後など）に追加 ---

/**
 * [外科手術的追加] AIが停止した際に強制的にフラグをリセットし、処理を続行させる
 */
function forceResumeAI() {
    addLog(`<span class="text-red-400">🚨 システム：AI強制再起動を実行します...</span>`);
    
    // 1. 進行を妨げている可能性があるフラグを強制リセット
    isAutoProcessing = false;
    isHandEffectProcessing = false;
    isPlacingCard = false;
    
    // モーダルが残っていると進行を妨げるため、選択モード中ならキャンセルを試みる
    if (typeof cancelSelection === 'function') cancelSelection(true);
    
    const p = players[turn];
    
    // 2. 現在のフェイズに応じて適切なAI関数を呼び出す
    if (currentPhase === PHASE.LOCK) {
        if (typeof autoLockPhase === 'function') autoLockPhase(p);
    } else if (currentPhase === PHASE.HAND) {
        if (typeof autoHandPhase === 'function') autoHandPhase(p);
    } else if (currentPhase === PHASE.MOVE) {
        if (typeof autoMovePhase === 'function') autoMovePhase(p);
    } else {
        // フェイズが不明な場合は次へ進める
        if (typeof nextPhase === 'function') nextPhase(true);
    }
}

async function initCpuOnlyGame(num) {
    window.FORCED_CPU_MODE = true; 
    
    // 全プレイヤーCPU戦用のプロフィールを準備（1番を抜いた構成）
    const cpuIcons = ["images/character_002.webp", "images/character_003.webp", "images/character_004.webp", "images/character_005.webp"];
    const cpuNames = ["CPU Alpha", "CPU Beta", "CPU Gamma", "CPU Delta"];
    
    window.pendingProfiles = [];
    for (let i = 0; i < num; i++) {
        window.pendingProfiles.push({ name: cpuNames[i], icon: cpuIcons[i] });
    }
    window.isProfileSet = true;

    // ゲーム開始
    await initGameInternal(num);
    
    // 全員を自動行動に
    isAutoAction = true;
    addLog("<span class='text-yellow-500 font-bold'>📺 P1を排除し、ALL CPU(P2-P5)で観戦を開始します</span>");
}

/**
 * 2026/03/14 追加：オンライン対戦ルームの作成
 * @param {string} roomID - 自由な文字列（例: "secret123"）
 */
async function createOnlineRoom(roomID) {
    const roomRef = window.MULTIPLAY.db.collection("rooms").doc(roomID);
    
    const initialData = {
        status: "waiting",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        hostID: userProfile.uid || "guest",
        players: [userProfile.name || "P1"],
        gameState: {
            turn: 0,
            phase: "LOCK",
            board: [] // ここに盤面データを載せていく
        }
    };

    try {
        await roomRef.set(initialData);
        window.MULTIPLAY.roomID = roomID;
        window.MULTIPLAY.playerNumber = 1;
        window.MULTIPLAY.isHost = true;
        
        addLog(`[Online] ルーム「${roomID}」を作成しました。待機中です...`);
        listenRoomUpdate(roomID); // 変化を監視開始
    } catch (e) {
        addLog(`[ERROR] ルーム作成失敗: ${e.message}`, true);
    }
}

/**
 * 2026/03/14 修正：ルームの更新を監視し、自動開始させる
 */
/* 2026/03/14 修正：盤面復元とUI切り替えを追加 */
/* 2026/03/14 修正：監視開始時に「現在の最新データ」を一度強制的に読み込む */
function listenRoomUpdate(roomID) {
    const roomRef = window.MULTIPLAY.db.collection("rooms").doc(roomID);

    // 監視(onSnapshot)を開始
    roomRef.onSnapshot((doc) => {
        if (!doc.exists) return;
        const data = doc.data();
        
        // ログを出して動いているか確認
        console.log("[Firebase] 受信データ:", data.status, data.gameState?.status);

        // --- 1. ステータスが "ready" かつ ホストなら開始 ---
        if (data.status === "ready" && !winner) {
            if (window.MULTIPLAY.isHost) {
                startOnlineGameHost(2); 
            }
        }

        // --- 2. 盤面の復元（ここがゲストにとって重要！） ---
        /* 2026/03/14 修正：新データ形式（直下書き込み）に対応 */
        /* 2026/03/14 修正：バラバラに届いたデータを組み立て直す */
        /* 2026/03/14 修正：ゲスト側での変数未定義エラーを防止 */
        if (data.status === "playing") {
            /* 2026/03/14 修正：各種変数の実体を確実に作成してエラーを防ぐ */
            if (!collections) collections = {}; 
            if (!hands) hands = {}; 
            // プレイヤー1と2の手札用の箱をあらかじめ作っておく
            [1, 2].forEach(id => { if(!hands[id]) hands[id] = []; });
            // ゲスト側で未定義になりやすい変数をデフォルト値で初期化
            if (typeof window.currentPhaseMaxTime === 'undefined') window.currentPhaseMaxTime = 15;
            if (typeof window.PHASE_TIME_ADD === 'undefined') window.PHASE_TIME_ADD = 15;
            if (typeof isP1HandOnlyView === 'undefined') isP1HandOnlyView = false;

            const homeVisible = !document.getElementById('home-screen').classList.contains('hidden');
            
            if (!board || board.length === 0 || homeVisible) {
                addLog(`[Online] 盤面データを受信。復元を開始します...`);

                // 1. プレイヤーの復元（文字列を | で分解して戻す）
                /* 2026/03/14 修正：プレイヤー情報と同時にロックエリアも初期化 */
                if (data.players_flat) {
                    // まず collections を空にする
                    collections = {};
                    /* 2026/03/14 修正：アイコンと名前の順序を同期 */
                    players = data.players_flat.map(pStr => {
                        const [id, icon, name, sx, sy, colId, firstCardId] = pStr.split('|');
                        const pId = parseInt(id);
                        const pColor = BASE_COLORS.find(c => c.id === colId);
                        
                        // ロックエリアの枠組みを作成
                        collections[pId] = {};
                        BASE_COLORS.forEach(bc => collections[pId][bc.id] = []);

                        // ファーストカードがあればロックエリアに入れる
                        if (firstCardId) {
                            const fCardData = CARD_DATABASE.find(d => d.id === parseInt(firstCardId));
                            if (fCardData) {
                                collections[pId][fCardData.colorId].push(createCardInstance(fCardData));
                            }
                        }

                        return {
                            id: pId, name, icon,
                            x: parseInt(sx), y: parseInt(sy),
                            startPos: { x: parseInt(sx), y: parseInt(sy) },
                            color: pColor, pieceImage: pColor.pieceImage,
                            css: `${pColor.bg} border-2 border-white`
                        };
                    });
                    
                    /* 2026/03/14 修正：プレイヤー情報の反映をさらに確実に実行 */
                    // 1. まず変数を窓口（window）にセットしてエラーを防ぐ
                    window.currentPhaseMaxTime = 15;
                    window.PHASE_TIME_ADD = 15;

                    // 2. 画面への反映を時間差で2回行い、描画漏れを防ぐ
                    setTimeout(() => {
                        if (typeof renderStatus === 'function') renderStatus();
                        if (typeof updateGameState === 'function') updateGameState();
                        console.log("[Online] UI Sync Phase 1:", players.map(p => p.name));
                    }, 200);

                    setTimeout(() => {
                        if (typeof renderStatus === 'function') renderStatus();
                        console.log("[Online] UI Sync Phase 2 (Final)");
                    }, 1000); 
                }

                // 2. UIの生成（マス目を作る）
                if (typeof generateUI === 'function') generateUI(); 
                ['setup-overlay', 'home-screen', 'title-overlay'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.classList.add('hidden');
                });

                // 3. 盤面の復元（JSON文字列をオブジェクトに戻す）
                if (data.board_flat) {
                    const decodedBoard = data.board_flat.map(s => JSON.parse(s));
                    deserializeBoard(decodedBoard);
                }

                // 4. 山札の復元
                if (data.deck_flat) {
                    deck = data.deck_flat.map(id => createCardInstance(CARD_DATABASE.find(c => c.id === id)));
                }

                /* 2026/03/14 修正：相手が使ったカードの演出を同期表示 */
        if (data.lastCardEffect) {
            const effect = data.lastCardEffect;
            // まだ表示していない、かつ自分以外のプレイヤーの演出であれば実行
            if (window.lastSyncedEffectTime !== effect.timestamp && effect.playerName !== players[window.MULTIPLAY.playerNumber-1].name) {
                window.lastSyncedEffectTime = effect.timestamp;
                
                const effectCard = CARD_DATABASE.find(c => c.id === effect.cardId);
                if (effectCard && typeof showCardModal === 'function') {
                    // 相手の演出なので、コールバック（OKボタン後の処理）は空っぽにする
                    // ※実際の処理は相手のブラウザで実行され、その結果がFirebase経由で届くため
                    showCardModal(effectCard, () => {}, "手札効果発動！", effect.playerName, "手札から効果を発動しました");
                }
            }
        }
                
                /* 2026/03/14 修正：ゲスト側でも開始演出（ロゴ・先手通知）を表示 */
                /* 2026/03/14 修正：ホストからの先手情報(currentTurn)を待ってから演出を開始する */
                updateGameState();

                const startSequence = () => {
                    if (data.currentTurn === undefined) {
                        // まだ先手データがFirebaseに届いていなければ、0.5秒待って再トライ
                        setTimeout(startSequence, 500);
                        return;
                    }

                    // ホストが決めた先手を自分の turn 変数に上書き
                    turn = data.currentTurn;

                    if (typeof showOpeningLogo === 'function') {
                        showOpeningLogo(() => {
                            const firstPlayer = players[turn];
                            const msg = `<div class="flex flex-col items-center gap-4 animate-bounce">
                                <span class="text-xs text-gray-400 font-bold tracking-[0.3em] uppercase">Starting Order</span>
                                <div class="flex items-center gap-3 bg-white/10 px-6 py-3 rounded-full border border-white/20">
                                    <span class="text-2xl font-black text-yellow-400">1st</span>
                                    <img src="${firstPlayer.icon}" class="w-10 h-10 rounded-full border-2 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]">
                                    <span class="text-xl font-bold text-white">${firstPlayer.name}</span>
                                </div>
                            </div>`;
                            
                            if (typeof showMessageOverlay === 'function') {
                                showMessageOverlay(msg, 2000, () => {
                                    addLog(`[Online] 先手は ${firstPlayer.name} です。`);
                                    startTurn(); 
                                });
                            } else {
                                startTurn();
                            }
                        });
                    }
                };

                // 演出シーケンスを実行
                startSequence();
                addLog(`[Online] 対戦を開始しました！先手は ${players[turn].name} です。`);
            }
        }

        /* 2026/03/14 修正：ターンとフェイズの同期を受信 */
        if (data.currentTurn !== undefined && data.currentPhase !== undefined) {
            // 相手から届いたターン・フェイズが今の自分と違う場合のみ更新
            if (turn !== data.currentTurn || currentPhase !== data.currentPhase) {
                const oldTurn = turn;
                const newTurn = data.currentTurn;
                
                // 真実のデータ（Firebase）を自分の変数に同期
                turn = newTurn;
                currentPhase = data.currentPhase;
                
                if (oldTurn !== newTurn) {
                    addLog(`[Online] ターンが ${players[turn].name} に移りました。`);
                    // 前の人のターンの残骸を掃除
                    isEndingTurn = false;
                    isProcessingMove = false;
                    if(timerInterval) clearInterval(timerInterval);
                    // 次の人のターンを開始
                    startTurn(); 
                } else {
                    updateGameState(true);
                }
            }
        }
        
        /* 2026/03/14 修正：データ階層の変更に合わせて移動同期を修正（重複を削除） */
        
        /* 2026/03/14 修正：データ階層の変更に合わせて移動同期を修正 */
        /* 2026/03/14 修正：データ階層の変更に合わせて移動同期を修正（重複を削除） */
        if (data.lastMove) {
            const move = data.lastMove;
            if (players && players.length > 0) {
                const movingP = players.find(pl => pl.id === move.playerId);
                if (movingP && move.playerId !== window.MULTIPLAY.playerNumber && movingP.lastSyncedTimestamp !== move.timestamp) {
                    movingP.lastSyncedTimestamp = move.timestamp;
                    addLog(`[Online] ${movingP.name} の移動を受信`);
                    moveToCell(movingP, move.x, move.y, false, () => {
                        updateGameState();
                    });
                }
            }
        }

        /* 2026/03/14 修正：相手の手札枚数の同期を受信 */
        /* 2026/03/14 修正：相手のロックエリアの同期を受信 */
        /* 2026/03/15 修正：相手の手札変更（ロックや使用）をリアルタイムに受信して反映 */
        players.forEach(p => {
            if (p.id !== window.MULTIPLAY.playerNumber) {
                // 1. 相手のロックエリアが更新されたら自分の画面も書き換える
                BASE_COLORS.forEach(bc => {
                    const remoteLockIDs = data[`lock_${p.id}_${bc.id}`];
                    if (remoteLockIDs && Array.isArray(remoteLockIDs)) {
                        const localSlot = collections[p.id][bc.id];
                        if (localSlot.length !== remoteLockIDs.length) {
                            collections[p.id][bc.id] = remoteLockIDs.map(id => 
                                createCardInstance(CARD_DATABASE.find(c => c.id === id))
                            );
                            if (typeof renderStatus === 'function') renderStatus();
                        }
                    }
                });

                // 2. 相手の手札枚数の同期（念押し）
                const remoteCount = data[`handCount_${p.id}`];
                if (remoteCount !== undefined && (!hands[p.id] || hands[p.id].length !== remoteCount)) {
                    hands[p.id] = new Array(remoteCount).fill({ name: "Unknown", colorId: "white" });
                    if (typeof renderStatus === 'function') renderStatus();
                }
            }
        });

        /* 2026/03/14 修正：山札の同期を受信 */
        if (data.deck_flat && deck) {
            // 自分の手元の枚数と Firebase の枚数が違う場合のみ更新
            if (deck.length !== data.deck_flat.length) {
                // 届いたIDリストに基づいて山札を再構築
                deck = data.deck_flat.map(id => createCardInstance(CARD_DATABASE.find(c => c.id === id)));
                if (typeof renderDeckAndDiscard === 'function') renderDeckAndDiscard();
                console.log(`[Online] 山札を同期しました。残り: ${deck.length}枚`);
            }
        }

    });
}



/**
 * 2026/03/14 追加：オンラインメニュー表示
 */
function showOnlineMenu() {
    document.getElementById('online-menu-overlay').classList.remove('hidden');
}

/**
 * 部屋を作るボタン
 */
async function handleCreateRoom() {
    const id = document.getElementById('online-room-input').value;
    if (!id) { alert("ルームIDを入力してください"); return; }
    
    // 前のステップで作った createOnlineRoom を呼び出し
    await createOnlineRoom(id);
    document.getElementById('online-menu-overlay').classList.add('hidden');
    addLog(`[System] 通信待機中... ID: ${id}`);
}

/**
 * 部屋に入るボタン（TODO: 入室ロジックは次のステップで！）
 */
/**
 * 2026/03/14 修正：ゲストが入室し、Firebaseを更新してホストに合図を送る
 */
async function handleJoinRoom() {
    const id = document.getElementById('online-room-input').value;
    if (!id) { alert("ルームIDを入力してください"); return; }

    const roomRef = window.MULTIPLAY.db.collection("rooms").doc(id);
    
    try {
        const doc = await roomRef.get();
        if (!doc.exists) {
            alert("ルームが見つかりません。IDを確認してください。");
            return;
        }

        const data = doc.data();
        if (data.players && data.players.length >= 2) {
            alert("このルームは既に満員です。");
            return;
        }

        // 1. 自分の名前を入室リストに追加し、ステータスを "ready" に変える
        /* 2026/03/14 修正：自分の最新プロフィールをホストへ通知 */
        const guestName = userProfile.name || "GuestPlayer";
        const guestIcon = (userProfile.icon && !userProfile.icon.includes('googleusercontent')) ? userProfile.icon : `images/character_002.webp`;

        await roomRef.update({
            "players": firebase.firestore.FieldValue.arrayUnion(guestName),
            "status": "ready",
            // P2の情報を直接書き込む（ホストがこれを読み取ります）
            "guestInfo": `${guestName}|${guestIcon}`
        });

        // 2. 自分のマルチプレイ設定を保存
        window.MULTIPLAY.roomID = id;
        window.MULTIPLAY.playerNumber = 2; // ゲストは2番
        window.MULTIPLAY.isHost = false;

        document.getElementById('online-menu-overlay').classList.add('hidden');
        addLog(`[Online] ルーム「${id}」に入室成功！開始を待っています...`);

        // 3. 監視を開始
        listenRoomUpdate(id);

    } catch (e) {
        addLog(`[ERROR] 入室に失敗しました: ${e.message}`, true);
        console.error(e);
    }
}

/**
 * 2026/03/14 追加：既存のルームへ入室する (Guest)
 */
async function handleJoinRoom() {
    const id = document.getElementById('online-room-input').value;
    if (!id) { alert("ルームIDを入力してください"); return; }

    const roomRef = window.MULTIPLAY.db.collection("rooms").doc(id);
    const doc = await roomRef.get();

    if (!doc.exists) {
        alert("ルームが見つかりません。IDを確認してください。");
        return;
    }

    const data = doc.data();
    if (data.players.length >= 2) {
        alert("このルームは既に満員です。");
        return;
    }

    // 自分の情報を追加して更新
    try {
        await roomRef.update({
            players: firebase.firestore.FieldValue.arrayUnion(userProfile.name || "GuestPlayer"),
            status: "ready" // 二人揃ったのでステータスを更新
        });

        window.MULTIPLAY.roomID = id;
        window.MULTIPLAY.playerNumber = 2; // Guestは2番
        window.MULTIPLAY.isHost = false;

        document.getElementById('online-menu-overlay').classList.add('hidden');
        addLog(`[Online] ルーム「${id}」に入室しました！`);
        
        listenRoomUpdate(id); // 監視開始
    } catch (e) {
        addLog(`[ERROR] 入室失敗: ${e.message}`, true);
    }
}

/**
 * 2026/03/14 追加：ホストによるオンライン戦の開始
 */
/**
 * 2026/03/14 修正：ホストが盤面を作成し、Firebaseへ「真実」を書き込む
 */
/* 2026/03/14 修正：画面の非表示処理を追加 */
/* 2026/03/14 修正：Firebaseエラーを回避するため、データを徹底的に分解して送信 */
async function startOnlineGameHost(num) {
    const homeScreen = document.getElementById('home-screen');
    if(homeScreen) homeScreen.classList.add('hidden');
    const setupOverlay = document.getElementById('setup-overlay');
    if(setupOverlay) setupOverlay.classList.add('hidden');

    // 1. 手元で初期化
    await initGameInternal(num);
    
    // 2. 盤面を1次元の「文字」に変換（もっとも安全な方法）
    const boardStrings = serializeBoard(board).map(cell => JSON.stringify(cell));
    
    // 3. デッキとプレイヤーをただの「数字/文字の配列」にする
    const deckIDs = (deck || []).map(c => c.id);
    /* 2026/03/14 修正：プレイヤーの初期ロック情報（ファーストカード）も文字列に含める */
    /* 2026/03/14 修正：Googleアイコンのエラー防止措置を追加 */
    /* 2026/03/14 修正：ホスト自身の最新情報を確実に送信 */
    const playersBasic = players.map((p, idx) => {
        const firstCard = collections[p.id][p.color.id][0];
        const firstCardId = firstCard ? firstCard.id : "";
        
        // P1（ホスト自身）の場合は、userProfile の最新の名前を使う
        const actualName = (p.id === 1) ? (userProfile.name || p.name) : p.name;
        
        let safeIcon = p.icon;
        if (!safeIcon || safeIcon.includes('googleusercontent') || safeIcon.includes('http')) {
            safeIcon = `images/character_00${p.id}.webp`;
        }
        
        return `${p.id}|${safeIcon}|${actualName}|${p.startPos.x}|${p.startPos.y}|${p.color.id}|${firstCardId}`;
    });

    const roomRef = window.MULTIPLAY.db.collection("rooms").doc(window.MULTIPLAY.roomID);
    
    try {
        // 全てを「配列の配列」にせず、バラバラの項目として保存
        /* 2026/03/14 修正：決定した先手（turn）も同期データに含める */
        await roomRef.update({
            "status": "playing",
            "currentTurn": turn, // ホストがランダムに決めた先手番号
            "board_flat": boardStrings,     // 文字列の配列
            "deck_flat": deckIDs,           // 数値の配列
            "players_flat": playersBasic,   // 文字列の配列
            "lastUpdate": Date.now()
        });
        addLog(`[Online] 盤面を同期しました。`);
    } catch (e) {
        console.error("Firebase送信エラー:", e);
        addLog(`[ERROR] 同期失敗: ${e.message}`, true);
    }
}

/**
 * 2026/03/14 追加：受信した数字データから実際のカードを復元する
 */
/* 2026/03/14 修正：1次元で届いた盤面データを 7x7 に復元する */
function deserializeBoard(flatBoard) {
    if (!flatBoard || !Array.isArray(flatBoard)) return;
    
    // 空の7x7配列を作成
    const newBoard = Array.from({ length: 7 }, () => Array(7).fill(null));

    flatBoard.forEach(miniCell => {
        const cardData = miniCell.cardID ? CARD_DATABASE.find(d => d.id === miniCell.cardID) : null;
        newBoard[miniCell.y][miniCell.x] = {
            x: miniCell.x,
            y: miniCell.y,
            color: cardData ? createCardInstance(cardData) : null,
            revealed: miniCell.revealed,
            empty: miniCell.empty,
            stack: (miniCell.stackIDs || []).map(id => {
                const data = CARD_DATABASE.find(c => c.id === id);
                return data ? createCardInstance(data) : null;
            }).filter(c => c !== null)
        };
    });

    board = newBoard;
    renderBoard();
}