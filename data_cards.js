/**
 * 7 SHADES OF S:EVEN - data_cards.js
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
    { id: 1, name: "紅蓮の火山 ワイナウエア", colorId: "red", type: "ETERNAL", arrival: "(なし)", hand: "【追色1】任意の1マスのカードをすべて捨てる。ロックエリアにあっても発動可。", handEffect: { cost: { color: 'red', amount: 1 }, action: { type: 'select_cell', count: 1, logic: 'destroy_all', prompt: '破壊するマスを選択' } },
          description: "手札効果補足：\n１マスに複数枚のカードがあれば、それらをすべて捨てる。" },
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
    { id: 13, name: "桃のキューブ セレナーデ", colorId: "pink", type: "FIRST", arrival: "-", hand: "【追色1】手札を1枚ロックする。ただし最後のロックはできない。", handEffect: { cost: { color: 'pink', amount: 1 }, action: { type: 'serenade_hand' } } },
    { id: 14, name: "紫のキューブ ディメンション", colorId: "purple", type: "FIRST", arrival: "-", hand: "【追色1】このターンの通常の移動は2マス先に一気に移動する。ロック中も可。", handEffect: { cost: { color: 'purple', amount: 1 }, action: { type: 'dimension_hand' } } },

    { id: 15, name: "ダッシュ", colorId: "red", type: "NORMAL", arrival: "隣接する1マスへ追加移動する。", arrivalEffect: { action: { type: 'select_cell', count: 1, logic: 'move_player', range: 1, prompt: '追加移動先を選択(隣接マス)', noCancel: true } }, hand: "通常移動に加え、もう1回移動できる。", handEffect: { action: { type: 'dash_effect', msg: '追加移動が可能になりました' } } },
    { id: 16, name: "フォース", colorId: "orange", type: "NORMAL", arrival: "隣のマスのカード1枚を手札に加える。", arrivalEffect: { action: { type: 'select_cell_adjacent', count: 1, logic: 'add_to_hand', range: 1, prompt: '隣のカードを選択して獲得', noCancel: true } },hand: "【追色1】相手1人を、カードの置かれた任意のマスへ移動させる。このカードを捨てる。", handEffect: { cost: { color: 'orange', amount: 1 }, action: { type: 'force_hand_flow' },stayInHandDuringEffect: true } },
    { id: 17, name: "盗賊の技 - スティール -", colorId: "yellow", type: "NORMAL", arrival: "最多ロック者1名を選び、その手札から1枚を奪う（裏向き選択）。", arrivalEffect: { action: { type: 'steal_hand_logic' } }, hand: "上記の到達時効果を得る。このカードを捨てる。", handEffect: { action: { type: 'steal_hand_logic' } } , isNegative: true},
    { id: 18, name: "民の道の建設", colorId: "green", type: "NORMAL", arrival: "空の5マスに山札からカードを裏向きで置く。", arrivalEffect: { action: { type: 'select_cell', count: 5, logic: 'place_deck_sequential_empty', prompt: '空のマスを5つ選択してください', noCancel: true,autoBtnText: "おまかせ" } }, hand: "相手の周囲以外の任意の2マスの裏向きカードを2枚、カードのない2マスに移動させる。このカードを捨てる。", handEffect: { action: { type: 'civil_path_hand' } } },   
    { id: 19, name: "欲しがりの吊り橋", colorId: "blue", type: "NORMAL", arrival: "手札1捨て or 元の場所へ戻る（獲得は有効）。", arrivalEffect: { action: { type: 'greedy_choice' } }, hand: "周囲以外に裏向きで置き、さらにその周囲1マスのカードを1枚この下に敷く。", handEffect: { action: { type: 'greedy_bridge_hand' } } },
    { id: 20, name: "情報開示", colorId: "pink", type: "NORMAL", arrival: "中央と四隅のカードをオープンする（連鎖発動）。", arrivalEffect: { action: { type: 'info_disclosure' } }, hand: "2枚ドローして公開する。それらの手札効果はこのターン使うことができない。このカードを捨てる。", handEffect: { action: { type: 'draw_reveal_seal', value: 2 } } },
    { id: 21, name: "ちょっと待った!", colorId: "purple", type: "NORMAL", arrival: "移動前へ強制移動し、改めて1マス移動。", arrivalEffect: { action: { type: 'chotto_matta_flow' } }, hand: "相手が最後のロックをする時に使える。【追色1】ロックしようとしたカードを捨てる。その相手はこのターンにロックできない。", handEffect: { cost: { color: 'purple', amount: 1 }, action: { type: 'chotto_matta_hand' } } },
    { id: 22, name: "反撃", colorId: "red", type: "NORMAL", arrival: "手札が最少なら、2ドロー1捨て。", arrivalEffect: { action: { type: 'counter_arrival' } }, hand: "接触された時に発動。接触を無効化し、逆に接触し返す。このカードを捨てる。", handEffect: { action: { type: 'counter_hand_reaction' } } },
    { id: 23, name: "誰かの落とし物", colorId: "orange", type: "NORMAL", arrival: "山札から1枚ドロー。", arrivalEffect: { action: { type: 'draw', value: 1 } }, hand: "相手ゲートに置き、山札から1枚ドロー。このカードを捨てる。", handEffect: { action: { type: 'lost_item_hand' } } },
    { id: 24, name: "神鳴 - カミナリ -", colorId: "yellow", type: "NORMAL", arrival: "自ゲートへ強制移動（カードは獲得しない）。", arrivalEffect: { action: { type: 'return_gate_no_open' } }, hand: "任意の1マスの全カードを破棄する。このカードを捨てる。", handEffect: { action: { type: 'thunder_hand' } }},
    { id: 25, name: "富裕層の気まぐれ", colorId: "green", type: "NORMAL", arrival: "手札3枚以上のプレイヤーは全員、手札1枚を空きマスに裏向きで置く。", arrivalEffect: { action: { type: 'rich_whim_logic' } }, hand: "上記の到達時の効果を得る。このカードを捨てる。", handEffect: { action: { type: 'rich_whim_logic' } } },
    { id: 26, name: "仕掛けられた罠", colorId: "blue", type: "NORMAL", arrival: "手札を半分(端数切捨て)捨てる。", arrivalEffect: { action: { type: 'trapped_trap_arrival' } }, hand: "周囲以外に裏向きで置く。置いたマスの周囲1枚を選んで捨てる。このカードを捨てる。", handEffect: { action: { type: 'trapped_trap_hand' } } },
    { id: 27, name: "誰かの好きな花", colorId: "pink", type: "NORMAL", arrival: "相手1人を選び、このカードを相手の手札に加える。自身は1枚ドロー。", arrivalEffect: { action: { type: 'favorite_flower_arrival' } }, hand: "最多ロック者1名を選び、その周囲にこのカードを表向きで置く。自身は1枚ドロー。", handEffect: { action: { type: 'favorite_flower_hand' } } , isNegativeArrival: true},
    { id: 28, name: "予言者の技 - アポカリプス -", colorId: "purple", type: "NORMAL", arrival: "手札1枚を周囲のマスに裏向きで置く。", arrivalEffect: { action: { type: 'apocalypse_arrival' } }, hand: "色を2つ宣言し、ドロー。的中すれば繰り返す。このカードを捨てる。", handEffect: { action: { type: 'apocalypse_hand' } } },
    { id: 29, name: "なないろの欠片", colorId: "rainbow", type: "NORMAL", arrival: "なし", arrivalEffect: null, hand: "1ドロー / 条件付き2ロック2ドロー。", handEffect: { action: { type: 'rainbow_fragment_choice' } } },
    { id: 30, name: "カラフルホール", colorId: "white", type: "NORMAL", arrival: "任意1マスのカードをすべて獲得。", arrivalEffect: { action: { type: 'select_cell', count: 1, logic: 'add_all_to_hand', prompt: '全て獲得するマスを選択', noCancel: true } }, hand: "最多ロック者1名を選び、ロックカードを1枚奪う（相手が選ぶ）。このカードを捨てる。", handEffect: { action: { type: 'colorful_hall_hand' } } , isNegative: true},
    { id: 31, name: "なないろのあめ", colorId: "white", type: "NORMAL", arrival: "(なし)", arrivalEffect: { action: { type: 'nanairo_no_ame' } }, hand: "任意の縦横1列(7マス)に山札からカードを裏向きで置く。このカードを捨てる。", handEffect: { action: { type: 'nanairo_no_ame_hand' } } },
    { id: 32, name: "いろ落ちガエル", colorId: "black", type: "NORMAL", arrival: "全員手札全捨て。最少ロック者へこのカードを渡す。", arrivalEffect: { action: { type: 'frog_arrival' } }, hand: "最多ロック者はロックを1枚捨てる。自身は手札をすべて捨てる。このカードを捨てる。", handEffect: { action: { type: 'frog_hand' } } , isNegative: true},
    { id: 33, name: "強欲なパレット", colorId: "black", type: "NORMAL", arrival: "手札全捨て。", arrivalEffect: { action: { type: 'discard_all_hand' } }, hand: "【いつでも可】色を1色宣言。相手全員は「宣言色の手札1枚を渡す」か「手札3枚捨てる」か選ぶ。", handEffect: { action: { type: 'greedy_palette_hand' }, anytime: true } },
    { id: 34, name: "にじいろの呪い", colorId: "black", type: "NORMAL", arrival: "空きスロットへ自動ロック。2枚ロックで追放。", arrivalEffect: { action: { type: 'rainbow_curse_logic' } }, hand: "最多ロック者1名へ呪いを押し付ける。このカードを捨てる。", handEffect: { action: { type: 'rainbow_curse_hand' } } , isNegative: true},

    { id: "B1", name: "赤のブーストカード", colorId: "red", type: "BOOST", arrival: "-", hand: "-", arrivalEffect: null, handEffect: null },
    { id: "B2", name: "橙のブーストカード", colorId: "orange", type: "BOOST", arrival: "-", hand: "-", arrivalEffect: null, handEffect: null },
    { id: "B3", name: "黄のブーストカード", colorId: "yellow", type: "BOOST", arrival: "-", hand: "-", arrivalEffect: null, handEffect: null },
    { id: "B4", name: "緑のブーストカード", colorId: "green", type: "BOOST", arrival: "-", hand: "-", arrivalEffect: null, handEffect: null },
    { id: "B5", name: "青のブーストカード", colorId: "blue", type: "BOOST", arrival: "-", hand: "-", arrivalEffect: null, handEffect: null },
    { id: "B6", name: "桃のブーストカード", colorId: "pink", type: "BOOST", arrival: "-", hand: "-", arrivalEffect: null, handEffect: null },
    { id: "B7", name: "紫のブーストカード", colorId: "purple", type: "BOOST", arrival: "-", hand: "-", arrivalEffect: null, handEffect: null }
];



/**
 * 2026/02/24 17:55 修正
 * 1. ルールモーダル用：用語定義データ (GLOSSARY_DATA) を追加
 */
const GLOSSARY_DATA = [
    { term: "相手", desc: "あなた以外のプレイヤーまたはそのプレイヤーの駒のこと。" },
    { term: "相手ゲート侵攻", desc: "・相手のゲートにあなたの駒が置かれた状態でターンが終了となったら、相手の手札からカードを無作為に半分（小数点以下切捨て）あなたの手札に加える。<br>・盤面場外のエターナルカードを無作為に１枚あなたの手札に加える。<br>・あなたのゲートに置かれたカードをすべて自分の手札に加えて、あなたは自分のゲートに強制移動する。" },
    { term: "相手の周囲", desc: "あなた以外のプレイヤーの駒の周囲のこと。" },
    { term: "「1番上」の原則", desc: "マスのカードを対象とする場合、特に表記が無い場合は１番上に置いてあるカードを対象とする。" },
    { term: "1番多くロックしているプレイヤー", desc: "自分のロックエリアにロックされているカードの枚数が１番多いプレイヤーのこと。" },
    { term: "一気に移動する", desc: "「２マス先に一気に移動する」などの言い回しで使われる。この例の場合、１マス目の駒やカードの有無は関係なく移動が可能である。" },
    { term: "いつでも使える", desc: "この記載があれば、いつでも使えるが、効果の「処理中」は使えない。なお宣言の直後は可能である。" },
    { term: "移動", desc: "自分の駒を現在のマスとは別のマスに置き、置いたマスの１番上に裏向きのカードがあるなら、そのカードをオープンする。" },
    { term: "裏向き", desc: "カードのイラストや効果が記載された面が視認できないように配置されている状態のこと。" },
    { term: "エターナルカード", desc: "相手ゲート侵攻成功時に、もらえる特別なカード。エターナルカードはロックした状態で手札効果を得ることができる。このカードは、他のカードの効果の対象にならない。" },
    { term: "オープン", desc: "裏向きのカードを表向きにすること。" },
    { term: "表向き", desc: "カードのイラストや効果が記載された面が視認できるように配置されている状態のこと。" },
    { term: "ONLYカード", desc: "カードのイラスト左下に「ONLY」と記載されている。山札に入れられるONLYカードは１種類につき１枚まで。" },
    { term: "強制移動", desc: "移動先のマスにカードが無くてもできる「移動」のこと。" },
    { term: "ゲート", desc: "場を大きな正方形としたときの１辺にあたる７マスの中央のマスのこと。" },
    { term: "国宝キューブ", desc: "７色の国宝キューブがあり、セブンの0th EDITIONにおける「駒」のこと。" },
    { term: "駒", desc: "ムーブフェイズで移動させる物体のこと。0th EDITIONでは国宝キューブのこと。" },
    { term: "自分", desc: "プレイヤー自身、もしくはそのプレイヤーの駒のこと。" },
    { term: "周囲", desc: "駒の周りの縦横斜めの計８マスのこと。" },
    { term: "処理順の原則", desc: "効果発動者から時計回りに効果を処理する。" },
    { term: "順番", desc: "任意の方法で１人を決め、原則そのプレイヤーから時計回りとする。" },
    { term: "捨て場", desc: "捨てられたカードを置く場所のこと。盤面場外の好きな場所に表向きに置く。" },
    { term: "接触", desc: "移動する代わりに隣接する相手の手札を無作為に１枚奪い、その相手は自身のゲートに移動する。" },
    { term: "セブン", desc: "7 SHADES OF S:EVEN（シェイズオブセブン）の略称。" },
    { term: "善処の原則", desc: "プレイヤーは、カードの内容を可能な限り満足できるように努めなければならない。" },
    { term: "ターン", desc: "ロックフェイズの始まりからムーブフェイズの終わりまでのこと。" },
    { term: "他のカードの効果の対象にならない", desc: "他のカードのいかなる効果も受け付けず、影響を受けない。" },
    { term: "通常の移動", desc: "カードの効果によらないムーブフェイズで通常行う移動のこと。" },
    { term: "手札", desc: "原則、手札の枚数に上限はない。" },
    { term: "手札効果", desc: "カードの手札マークに記載されている効果。ハンドフェイズで使用可能。" },
    { term: "手札の半分", desc: "手札の枚数の半分（小数点以下切り捨て）のこと。" },
    { term: "到達", desc: "表向きカードの上に駒が置かれたタイミングのこと。" },
    { term: "到達効果", desc: "到達時に発動。効果を得てからカードを自分の手札に加える。" },
    { term: "隣", desc: "対象のいるマスの前後左右４マスのこと。" },
    { term: "隣り合うマス", desc: "マス同士が斜めではなく前後左右の位置関係を成しているマス。" },
    { term: "ドロー", desc: "山札からカードを自分の手札に加えること。" },
    { term: "場", desc: "盤面中央の７×７の計４９マスのこと。" },
    { term: "場の中央", desc: "７×７の計４９マスの中央のマスのこと。" },
    { term: "ハンドフェイズ", desc: "自分のターン第２のフェイズ。手札のカードを何枚でも使ってよい。" },
    { term: "ファーストカード", desc: "開始時にもらえる駒と同色のカード。ロック状態で開始し、奪われない。" },
    { term: "プレイヤー", desc: "参加者のこと。セブンは2人以上でプレイする。" },
    { term: "プレイヤー全員", desc: "あなたを含むすべてのプレイヤーのこと。" },
    { term: "マス", desc: "場の中にあるカードや駒を置く場所のこと。" },
    { term: "ムーブフェイズ", desc: "自分のターン第３のフェイズ。移動、もしくは接触しなければならない。" },
    { term: "無作為", desc: "意図や偏りを持たず、ランダムに行うこと。" },
    { term: "無色のカード", desc: "白色と黒色のカードは、色のない無色として扱う。" },
    { term: "山札", desc: "シャッフルして裏向きに積み重ねたもの。" },
    { term: "隣接する", desc: "「隣の」と同義。" },
    { term: "ロック", desc: "カード１枚をロックエリア内の同色場所へ表向きで置くこと。" },
    { term: "ロックエリア", desc: "カードをロックするための場所（赤〜紫の7箇所）。" }
];