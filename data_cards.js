/**
 * data_cards.js
 * カードデータベースと定数定義。
 * Excelの最新IDリストに基づき同期済み。
 */

const GRID_SIZE = 7;

const BASE_COLORS = [
    { id: 'red', name: '赤', bg: 'bg-red-500', hex: '#ef4444', pieceImage: 'images/piece_001.png' },
    { id: 'orange', name: '橙', bg: 'bg-orange-500', hex: '#f97316', pieceImage: 'images/piece_002.png' },
    { id: 'yellow', name: '黄', bg: 'bg-yellow-400', hex: '#facc15', pieceImage: 'images/piece_003.png' },
    { id: 'green', name: '緑', bg: 'bg-green-500', hex: '#22c55e', pieceImage: 'images/piece_004.png' },
    { id: 'blue', name: '青', bg: 'bg-blue-500', hex: '#3b82f6', pieceImage: 'images/piece_005.png' },
    { id: 'pink', name: '桃', bg: 'bg-pink-400', hex: '#f472b6', pieceImage: 'images/piece_006.png' },
    { id: 'purple', name: '紫', bg: 'bg-purple-600', hex: '#9333ea', pieceImage: 'images/piece_007.png' },
];

const RAINBOW_COLOR = { id: 'rainbow', name: '虹', bg: 'rainbow-card-face', hex: '#a855f7', isRainbow: true };
const WHITE_COLOR = { id: 'white', name: '白', bg: 'white-card-face', hex: '#ffffff', isNeutral: true };
const BLACK_COLOR = { id: 'black', name: '黒', bg: 'black-card-face', hex: '#000000', isNeutral: true };

const LOCK_ORDER = [...BASE_COLORS].reverse(); 
const SEATS = { top: {x: 3, y: 0}, right: {x: 6, y: 3}, bottom: {x: 3, y: 6}, left: {x: 0, y: 3} };
const PHASE = { LOCK: 'LOCK', HAND: 'HAND', MOVE: 'MOVE' };
const PHASE_TIME_SEC = 30;

const CARD_DATABASE = [
    { id: 1, name: "紅蓮の火山 ワイナウエア", colorId: "red", type: "ETERNAL", arrival: "(なし)", hand: "【追色1】任意の1マスのカードをすべて捨てる。ロックエリアにあっても発動可。", handEffect: { cost: { color: 'red', amount: 1 }, action: { type: 'select_cell', count: 1, logic: 'destroy_all', prompt: '破壊するマスを選択' } } },
    { id: 2, name: "禁断の果実 マルメゴ", colorId: "orange", type: "ETERNAL", arrival: "(なし)", hand: "【追色1】4枚ドロー。それらを公開。橙（虹含む）があれば全ハンデス＆通常移動不可。ロック中も可。", handEffect: { cost: { color: 'orange', amount: 1 }, action: { type: 'marmego_logic' } } },
    { id: 3, name: "黄金の宮殿 ドムス-ネロ", colorId: "yellow", type: "ETERNAL", arrival: "(なし)", hand: "【追色1】2枚ドロー。相手全員は1枚ドロー。この効果は1ターンに1度のみ。ロック中も可。", handEffect: { cost: { color: 'yellow', amount: 1 }, action: { type: 'domus_nero_logic' } } },
    { id: 4, name: "奇跡の森 マンズウッド", colorId: "green", type: "ETERNAL", arrival: "(なし)", hand: "【追色1】1枚ドロー。ロック中も可。", handEffect: { cost: { color: 'green', amount: 1 }, action: { type: 'draw', value: 1 } } },
    { id: 5, name: "月下の漂流船 プリドゥエン", colorId: "blue", type: "ETERNAL", arrival: "(なし)", hand: "【追色1】任意の2マスに山札からカードを1枚ずつ裏向きで置く。ロック中も可。", handEffect: { cost: { color: 'blue', amount: 1 }, action: { type: 'select_cell', count: 2, logic: 'place_deck_facedown', prompt: '配置するマスを2つ選択' } } },
    { id: 6, name: "結ばれの一本桜 コノハナサクヤ", colorId: "pink", type: "ETERNAL", arrival: "(なし)", hand: "【追色1】相手1人を周囲のカードが置かれたマスへ移動。自身は今ターン接触不可。ロック中も可。", handEffect: { cost: { color: 'pink', amount: 1 }, action: { type: 'konohana_logic' } } },
    { id: 7, name: "終わりなき化学 ゲンテクニーク", colorId: "purple", type: "ETERNAL", arrival: "(なし)", hand: "【追色1】任意の1マスのカードを1枚手札に加える。そのマスに山札から1枚裏向きで置く。ロック中も可。", handEffect: { cost: { color: 'purple', amount: 1 }, action: { type: 'select_cell', count: 1, logic: 'gentecnique_logic', prompt: 'カードを入れ替えるマスを選択' } } },
    
    { id: 8, name: "赤のキューブ フェニックス", colorId: "red", type: "FIRST", arrival: "-", hand: "【追色1】捨て場の1番上から2番目のカードを自分の手札に加える。ロック中も可。", handEffect: { cost: { color: 'red', amount: 1 }, action: { type: 'phoenix_salvage' } } },
    { id: 9, name: "橙のキューブ ハーベスト", colorId: "orange", type: "FIRST", arrival: "-", hand: "【追色1】2マス以内のマスのカードを1枚手札に加える。ロック中も可。", handEffect: { cost: { color: 'orange', amount: 1 }, action: { type: 'select_cell', count: 1, range: 2, logic: 'add_to_hand', prompt: '2マス以内のカードを選択して獲得' } } },
    { id: 10, name: "黄のキューブ サフラン", colorId: "yellow", type: "FIRST", arrival: "-", hand: "【追色1】2マス以内のマスのカードを4枚までオープンしてもよい。ロック中も可。", handEffect: { cost: { color: 'yellow', amount: 1 }, action: { type: 'select_cell', count: 4, range: 2, logic: 'open_facedown', prompt: '2マス以内のカードを選択してオープン' } } },
    { id: 11, name: "緑のキューブ ヴァーディアン", colorId: "green", type: "FIRST", arrival: "-", hand: "【追色1】2枚ドローし公開。ターン終了時それらを捨てる。1ターンに1度のみ。ロック中も可。", handEffect: { cost: { color: 'green', amount: 1 }, action: { type: 'viridian_hand' } } },
    { id: 12, name: "青のキューブ セレスティア", colorId: "blue", type: "FIRST", arrival: "-", hand: "【追色1】手札が3枚以上ある相手全員の手札から無作為に1枚ずつ選んで捨てる。ロック中も可。", handEffect: { cost: { color: 'blue', amount: 1 }, action: { type: 'celestia_hand' } } },
    { id: 13, name: "桃のキューブ セレナーデ", colorId: "pink", type: "FIRST", arrival: "-", hand: "【追色1】手札を1枚ロックする。ただし最後のロックはできない。1ターンに1度のみ。ロック中も可。", handEffect: { cost: { color: 'pink', amount: 1 }, action: { type: 'serenade_hand' } } },
    { id: 14, name: "紫のキューブ ディメンション", colorId: "purple", type: "FIRST", arrival: "-", hand: "【追色1】このターンの通常の移動は2マス先に一気に移動する。ロック中も可。", handEffect: { cost: { color: 'purple', amount: 1 }, action: { type: 'dimension_hand' } } },

    { id: 15, name: "ダッシュ", colorId: "red", type: "NORMAL", arrival: "隣接する1マスへ追加移動する。", arrivalEffect: { action: { type: 'select_cell', count: 1, logic: 'move_player', range: 1, prompt: '追加移動先を選択(隣接マス)', noCancel: true } }, hand: "通常移動に加え、もう1回移動できる。", handEffect: { action: { type: 'dash_effect', msg: '追加移動が可能になりました' } } },
    { id: 16, name: "フォース", colorId: "orange", type: "NORMAL", arrival: "隣のマスのカード1枚を手札に加える。", arrivalEffect: { action: { type: 'select_cell_adjacent', count: 1, logic: 'add_to_hand', range: 1, prompt: '隣のカードを選択して獲得', noCancel: true } },hand: "【追色1】相手1人を、カードの置かれた任意のマスへ移動させる。このカードを捨てる。", handEffect: { cost: { color: 'orange', amount: 1 }, action: { type: 'force_hand_flow' } } },
    { id: 17, name: "盗賊の技 - スティール -", colorId: "yellow", type: "NORMAL", arrival: "最多ロック者1名を選び、その手札から1枚を奪う（裏向き選択）。", arrivalEffect: { action: { type: 'steal_hand_logic' } }, hand: "上記の到達時効果を得る。このカードを捨てる。", handEffect: { action: { type: 'steal_hand_logic' } } },
    { id: 18, name: "民の道の建設", colorId: "green", type: "NORMAL", arrival: "空の5マスに山札からカードを裏向きで置く。", arrivalEffect: { action: { type: 'select_cell', count: 5, logic: 'place_deck_sequential_empty', prompt: '空のマスを5つ選択してください', noCancel: true,autoBtnText: "おまかせ" } }, hand: "相手の周囲以外の任意の2マスの裏向きカードを2枚、カードのない2マスに移動させる。このカードを捨てる。", handEffect: { action: { type: 'civil_path_hand' } } },   
    { id: 19, name: "欲しがりの吊り橋", colorId: "blue", type: "NORMAL", arrival: "手札1捨て or 元の場所へ戻る（獲得は有効）。", arrivalEffect: { action: { type: 'greedy_choice' } }, hand: "周囲以外に裏向きで置き、さらにその周囲1マスのカードを1枚この下に敷く。", handEffect: { action: { type: 'greedy_bridge_hand' } } },
    { id: 20, name: "情報開示", colorId: "pink", type: "NORMAL", arrival: "中央と四隅のカードをオープンする（連鎖発動）。", arrivalEffect: { action: { type: 'info_disclosure' } }, hand: "2枚ドローして公開する。それらの手札効果はこのターン使うことができない。このカードを捨てる。", handEffect: { action: { type: 'draw_reveal_seal', value: 2 } } },
    { id: 21, name: "ちょっと待った!", colorId: "purple", type: "NORMAL", arrival: "移動前へ強制移動し、改めて1マス移動。", arrivalEffect: { action: { type: 'chotto_matta_flow' } }, hand: "相手が最後のロックをする時に使える。【追色1】ロックしようとしたカードを捨てる。その相手はこのターンにロックできない。", handEffect: { cost: { color: 'purple', amount: 1 }, action: { type: 'chotto_matta_hand' } } },
    { id: 22, name: "反撃", colorId: "red", type: "NORMAL", arrival: "手札が最少なら、2ドロー1捨て。", arrivalEffect: { action: { type: 'counter_arrival' } }, hand: "接触された時に発動。接触を無効化し、逆に接触し返す。このカードを捨てる。", handEffect: { action: { type: 'counter_hand_reaction' } } },
    { id: 23, name: "誰かの落とし物", colorId: "orange", type: "NORMAL", arrival: "山札から1枚ドロー。", arrivalEffect: { action: { type: 'draw', value: 1 } }, hand: "相手ゲートに置き、山札から1枚ドロー。このカードを捨てる。", handEffect: { action: { type: 'lost_item_hand' } } },
    { id: 24, name: "神鳴 - カミナリ -", colorId: "yellow", type: "NORMAL", arrival: "自ゲートへ強制移動（カードは獲得しない）。", arrivalEffect: { action: { type: 'return_gate_no_open' } }, hand: "任意の1マスの全カードを破棄する。このカードを捨てる。", handEffect: { action: { type: 'thunder_hand' } }},
    { id: 25, name: "富裕層の気まぐれ", colorId: "green", type: "NORMAL", arrival: "手札3枚以上のプレイヤーは全員、手札1枚を空きマスに裏向きで置く。", arrivalEffect: { action: { type: 'rich_whim_logic' } }, hand: "上記の到達時の効果を得る。このカードを捨てる。", handEffect: { action: { type: 'rich_whim_logic' } } },
    { id: 26, name: "仕掛けられた罠", colorId: "blue", type: "NORMAL", arrival: "手札を半分(端数切捨て)捨てる。", arrivalEffect: { action: { type: 'trapped_trap_arrival' } }, hand: "周囲以外に裏向きで置く。置いたマスの周囲1枚を選んで捨てる。このカードを捨てる。", handEffect: { action: { type: 'trapped_trap_hand' } } },
    { id: 27, name: "誰かの好きな花", colorId: "pink", type: "NORMAL", arrival: "相手1人を選び、このカードを相手の手札に加える。自身は1枚ドロー。", arrivalEffect: { action: { type: 'favorite_flower_arrival' } }, hand: "最多ロック者1名を選び、その周囲にこのカードを表向きで置く。自身は1枚ドロー。", handEffect: { action: { type: 'favorite_flower_hand' } } },
    { id: 28, name: "予言者の技 - アポカリプス -", colorId: "purple", type: "NORMAL", arrival: "手札1枚を周囲のマスに裏向きで置く。", arrivalEffect: { action: { type: 'apocalypse_arrival' } }, hand: "色を2つ宣言し、ドロー。的中すれば繰り返す。このカードを捨てる。", handEffect: { action: { type: 'apocalypse_hand' } } },
    { id: 29, name: "なないろの欠片", colorId: "rainbow", type: "NORMAL", arrival: "なし", arrivalEffect: null, hand: "1ドロー / 条件付き2ロック2ドロー。", handEffect: { action: { type: 'rainbow_fragment_choice' } } },
    { id: 30, name: "カラフルホール", colorId: "white", type: "NORMAL", arrival: "任意1マスのカードをすべて獲得。", arrivalEffect: { action: { type: 'select_cell', count: 1, logic: 'add_all_to_hand', prompt: '全て獲得するマスを選択', noCancel: true } }, hand: "最多ロック者1名を選び、ロックカードを1枚奪う（相手が選ぶ）。このカードを捨てる。", handEffect: { action: { type: 'colorful_hall_hand' } } },
    { id: 31, name: "なないろのあめ", colorId: "white", type: "NORMAL", arrival: "(なし)", arrivalEffect: { action: { type: 'nanairo_no_ame' } }, hand: "任意の縦横1列(7マス)に山札からカードを裏向きで置く。このカードを捨てる。", handEffect: { action: { type: 'select_line', logic: 'fill_line', prompt: '対象の列（縦または横）を選択してください' } } },
    { id: 32, name: "いろ落ちガエル", colorId: "black", type: "NORMAL", arrival: "全員手札全捨て。最少ロック者へこのカードを渡す。", arrivalEffect: { action: { type: 'frog_arrival' } }, hand: "最多ロック者はロックを1枚捨てる。自身は手札をすべて捨てる。このカードを捨てる。", handEffect: { action: { type: 'frog_hand' } } },
    { id: 33, name: "強欲なパレット", colorId: "black", type: "NORMAL", arrival: "手札全捨て。", arrivalEffect: { action: { type: 'discard_all_hand' } }, hand: "【いつでも可】色を1色宣言。相手全員は「宣言色の手札1枚を渡す」か「手札3枚捨てる」か選ぶ。", handEffect: { action: { type: 'greedy_palette_hand' }, anytime: true } },
    { id: 34, name: "にじいろの呪い", colorId: "black", type: "NORMAL", arrival: "空きスロットへ自動ロック。2枚ロックで追放。", arrivalEffect: { action: { type: 'rainbow_curse_logic' } }, hand: "最多ロック者1名へ呪いを押し付ける。このカードを捨てる。", handEffect: { action: { type: 'rainbow_curse_hand' } } },
];