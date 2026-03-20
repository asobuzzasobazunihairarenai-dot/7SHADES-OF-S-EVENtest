/**
 * 7 SHADES OF S:EVEN - game_state.js
 * 【共通定義】
 * - 到達: 表向きカードの上に駒が置かれた瞬間
 * - 到達効果: 到達時に発動。原則「効果解決」→「カード獲得」の順。
 * - 例外: カードに処遇（場に残る、破棄等）が書かれている場合はそれに従う。
 */
/**
 * game_state.js
 * ゲームのグローバル変数を一括管理するファイル。
 * 最初に読み込むことで、全てのファイルから参照可能にします。
 */

let board = [];
let players = [];
let turn = 0;
let currentPhase = PHASE.LOCK;
let winner = null;
let collections = {};
let hands = {};
let deck = [];
let eternalDeck = [];
let discardPile = [];

// 2026/03/21 修正：ドラッグ＆ドロップ用の状態管理変数を追加
let isStuck = false;
let isAutoSkipping = false;
let isPlacingCard = false;
let isDraggingHandCard = false; // ★追加：現在手札をドラッグ中か
let draggedCardIndex = null;    // ★追加：ドラッグしている手札の番号
let isAutoAction = false;
let isAutoProcessing = false; 

/** 2026/03/04 追加：CPU戦強制モードフラグ **/
window.FORCED_CPU_MODE = false; 

// 2026/03/21 修正：手札の表示モード設定を追加
let isSkipSelectionOnAuto = false; 
let autoMode = 'EASY'; 
let handDisplayMode = 'fan'; // ★テスト用に 'fan' に書き換え

/**
 * 2026/03/06 修正
 * AI評価基準を最新のバランス表（ゲート侵攻重視）にアップデート
 */
window.AI_SCORE_CONFIG = {
    STACK_COUNT: 10,         // 枚数のあるマス (+10/枚)
    UNLOCKED_COLOR: 50,      // 未ロック色のあるマス (+50)
    ADJACENT_ENEMY: 5,       // 相手の隣のマス (+5)
    SELF_GATE_DEFENSE: 20,   // 自ゲート防衛（2マス内に敵） (+20)
    REACH_ENEMY_GATE: 100,   // 敵ゲートそのもの（1マス内に自分） (+100)
    RARE_COLOR: 20,          // 虹・白・黒 (+20)
    POWER_CARD_NEAR_SELF: 20, // 虹・白（2マス内に自分） (+20)
    POWER_CARD_NEAR_ENEMY: 20, // 虹・白（2マス内に敵） (+20)
    REMOVAL_PRIORITY: 20,    // 虹・黒（2マス内に自分）除去優先 (+20)
    STEAL_ACTION: 50,        // 接触行為自体 (+50)
    MOVE_TOWARD_GATE: 30     // 直近の相手ゲートに近づくためのマス (+30)
};

let invasionQueue = [];

let autoProcessTimeout = null; // 【追加】自動処理の待機タイマー保持用
let isEndingTurn = false; 
let isProcessingMove = false; 
let isPeekingMode = false; // 盤面確認中フラグ
let isHandEffectProcessing = false; // 【追加】手札効果の演出・処理中フラグ
let isBoostMode = false; // ★追加：ブーストモードフラグ
let activeTimerPlayerId = null; // 【追加】現在タイマーを減らしている対象プレイヤーのID (nullなら手番プレイヤー)

let timeLeft = PHASE_TIME_SEC;

let usedOnceEffectsThisTurn = []; // 【追加】そのターンに使用済みの「1回制限カードID」を記録
// ★追加：フェニックスのコストで捨てられたカードを一時保存するリスト
let phoenixExclusionList = [];

let isP1HandOnlyView = false; // ★追加：P1の手札のみを表示し続けるフラグ

let isTimerPaused = false; // ★追加：タイマー一時停止フラグ
let gameStartTime = null; // ★追加：ゲーム開始時刻（ミリ秒）
let totalTurnCount = 0; // ★追加：合計ターン数
let cardUsageStats = {}; // ★必ず = {} で初期化しておく
let lockHistory = []; // ★追加: [[p1ロック数, p2ロック数...], [p1, p2...]]
let timerInterval = null;
let tempAction = null;
let selectionState = { 
    active: false, type: null, count: 0, current: 0, selected: [], 
    logic: null, callback: null, range: null, prompt: null, 
    forbiddenTile: null, noCancel: false, origin: null, 
    isEightDirection: false, cancelCallback: null, autoBtnText: null, 
    restrictedCells: null, actingPlayer: null 
};
let testSelectedCards = [];
let testFirstCards = []; 
let testInitialLocks = []; 
let touchPreviewTimer = null;
let pointerStartTime = 0;
let isLongPressActive = false;
let activeHandCard = null; 
let activeTargetPos = null; 

let activeModalId = null;
let hoverTemporarilyDisabled = false;
let expandedLockColor = null;
let richWhimHistory = []; // {pos: {x,y}, player: object} の配列


/** 2026/03/09 修正：新称号判定用の統計カウンターを追加 **/
let playerStats = {}; 

// 1試合ごとの特殊アクション記録用
/** 2026/03/09 修正：追加称号用の統計カウンターを拡張 **/
let matchStats = {
    stolenCount: {}, matchVictimCount: {}, counterSuccess: {},
    flowerGifts: {}, apocalypseChain: {}, lavaDestroyCount: {},
    hasContacted: {}, wasCursed: {}, gateInvaded: {},
    gateInvasionCount: {}, handEffectUsedCount: {}, // ここが undefined だとエラーになる
    firstCardUseCount: {}, lockBreakCount: {}
};

let useGlobalTimer = false;

let timeAtTurnStart = 0;

let isLightMode = localStorage.getItem('shades_light_mode') !== 'false';

/**
 * 2026/02/23 17:50 修正
 * プロフィール（名前・アイコン）が設定済みかどうかを管理するフラグ
 */
let isProfileSet = false;

// --- 外科手術的追加：永続プロフィールデータ構造 ---
let userProfile = {
    name: "Player 1",
    icon: "images/piece_001.png",
    selectedTitle: "駆け出しの旅人",
    unlockedTitles: ["駆け出しの旅人"],
    seenTitles: ["駆け出しの旅人"],
    level: 1,
    totalWins: 0,
    totalEternalGets: 0,
    usedCardIds: [],      // ★追加：人生で一度でも手札として使ったカードIDリスト
    usedIconPaths: [],    // ★追加：一度でも使用したアイコンパスのリスト
    rankPoint: 0,
    rank: 1,
    stats: {
        totalGames: 0,    // すでにあるこの数値を対局数称号に使用
        colorUsage: { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, pink: 0, purple: 0 },
        mvpCard: null
    }
};

/**
 * localStorage からプロフィールを読み込む
 */
function loadUserProfile() {
    try {
        const savedData = localStorage.getItem('shades_seven_profile');
        if (savedData) {
            const parsed = JSON.parse(savedData);
            // 既存の構造を維持しつつ、不足しているキー（新しく追加されたスタッツ等）を補完
            userProfile = { ...userProfile, ...parsed };
            // statsなどのネストされた構造もマージ
            if (parsed.stats) {
                userProfile.stats = { ...userProfile.stats, ...parsed.stats };
            }
            window.isProfileSet = true;
            return true;
        }
    } catch (e) {
        console.error("Profile load error:", e);
    }
    return false;
}

// ページ読み込み時に即座に実行
loadUserProfile();

/**
 * localStorage へプロフィールを保存する
 */
function saveUserProfile() {
    try {
        localStorage.setItem('shades_seven_profile', JSON.stringify(userProfile));
    } catch (e) {
        console.error("プロフィール保存失敗:", e);
    }
}

// 起動時に自動実行
loadUserProfile();