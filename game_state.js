/**
 * 7 SHADES OF S:EVEN - Core Logic
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

let isStuck = false;
let isAutoSkipping = false;
let isPlacingCard = false;
let isAutoAction = false;
let isAutoProcessing = false; 
let invasionQueue = [];
let autoProcessTimeout = null; // 【追加】自動処理の待機タイマー保持用
let isEndingTurn = false; 
let isProcessingMove = false; 
let isPeekingMode = false; // 盤面確認中フラグ
let isHandEffectProcessing = false; // 【追加】手札効果の演出・処理中フラグ
let isBoostMode = false; // ★追加：ブーストモードフラグ

let timeLeft = PHASE_TIME_SEC;

let usedOnceEffectsThisTurn = []; // 【追加】そのターンに使用済みの「1回制限カードID」を記録

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


let playerStats = {}; // 各プレイヤーの統計（移動距離など）を保持

let useGlobalTimer = false; // タイマー形式フラグ (false: フェイズ固定, true: 全体持ち時間併用)

let timeAtTurnStart = 0;

let isLightMode = localStorage.getItem('shades_light_mode') !== 'false';

/**
 * 2026/02/23 17:50 修正
 * プロフィール（名前・アイコン）が設定済みかどうかを管理するフラグ
 */
let isProfileSet = false;