// ── sprites-obj32.js ── 盤面に乗る「物」の 32×32 ドット絵（キュー10番 10d）──
//
// なぜ 32 か：1ドットの大きさを cellPx/32（--cell:108px なら 3.375px）に揃えるため。
// プレイヤー・地面・木・山・茂み・看板・橋はすべて 32 ドット＝セル全面で描かれている。
// 12×16 や 8×8 の絵を 0.7／0.55 セルの箱に入れると 1ドットが 4.7px／6.75px になり、
// 同じ画面にドットの粗さが3種類混ざる（10a-1c と同じ理由）。
//
// 🔴 ここの絵は必ず「透明の余白」を絵の中に持つこと。canvas はセル全面に貼られる
//    （game/css/board.css の .dot32）∴見かけの大きさ＝絵の実効範囲（ink）で決まる。
//    余白なしで 32 ドットいっぱいに描くと、従来より 1.4 倍大きい物になる。
//    各絵の ink の目標値は tests/obj-dot32.spec.js が数えている（＝見かけを変えない保証）。
//
// パレットは従来のまま（shared/sprites-tiles.js の TILE_PAL / shared/sprites-items.js の
// ITEM_PAL）を使う＝色は変えず、ドットの粗さだけを揃える。

const N = 32;

const blank = () => Array.from({ length: N }, () => Array(N).fill(0));

const put = (g, r, c, v) => {
	if (r >= 0 && r < N && c >= 0 && c < N) g[r][c] = v;
};

const rect = (g, r0, c0, r1, c1, v) => {
	for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(g, r, c, v);
};

// 角を斜めに落とした矩形（cut=0 なら普通の矩形）。丸みを1枚で作れるので多用する。
const rrect = (g, r0, c0, r1, c1, cut, v) => {
	for (let r = r0; r <= r1; r++) {
		for (let c = c0; c <= c1; c++) {
			const dr = Math.min(r - r0, r1 - r);
			const dc = Math.min(c - c0, c1 - c);
			if (dr + dc < cut) continue;   // 角を落とす
			put(g, r, c, v);
		}
	}
};

// 円盤。半径に 0.4 足して測ると 3〜4 ドットの小さい円でも角が尖らない。
const disc = (g, cr, cc, rad, v) => {
	for (let r = cr - rad; r <= cr + rad; r++) {
		for (let c = cc - rad; c <= cc + rad; c++) {
			if ((r - cr) ** 2 + (c - cc) ** 2 <= rad * rad + rad * 0.4) put(g, r, c, v);
		}
	}
};

// 太さ w の直線（レバーの軸に使う）。
const line = (g, r0, c0, r1, c1, v, w = 1) => {
	const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
	for (let i = 0; i <= steps; i++) {
		const r = Math.round(r0 + ((r1 - r0) * i) / steps);
		const c = Math.round(c0 + ((c1 - c0) * i) / steps);
		for (let k = 0; k < w; k++) put(g, r, c + k, v);
	}
};

// 絵の外側に1ドットの輪郭を足す。⚠ 輪郭は ink を上下左右に1ドット広げる
// ∴各絵の本体は目標 ink より1ドット内側に描く（各生成関数のコメントに実寸を書く）。
const strokeOutside = (g, v = 1) => {
	const src = g.map(row => row.slice());
	for (let r = 0; r < N; r++) {
		for (let c = 0; c < N; c++) {
			if (src[r][c] !== 0) continue;
			const near = (src[r - 1]?.[c] ?? 0) || (src[r + 1]?.[c] ?? 0)
				|| (src[r][c - 1] ?? 0) || (src[r][c + 1] ?? 0);
			if (near) g[r][c] = v;
		}
	}
};

// 色の差し替え（アニメーションの「明るいフレーム」を作るのに使う）
const swap = (g, map) => g.map(row => row.map(v => map[v] ?? v));

// ── 石（STONE '*'）── ink 22×22（rows 5..26 / cols 5..26）────────────
// 押して動かす切り石。光は左上から＝上面と左を明るく、右下を暗く。
// 本体は rows 6..25 / cols 6..25（＋輪郭1ドットで目標 ink になる）。
function blockGrid() {
	const g = blank();
	rrect(g, 6, 6, 25, 25, 2, 3);          // 本体（中間色）
	rect(g, 6, 7, 10, 24, 4);              // 上面（明）
	for (let r = 7; r <= 24; r++) put(g, r, 7, 4);        // 左の面取り（明）
	for (let c = 7; c <= 24; c++) put(g, 24, c, 2);       // 下の面取り（暗）
	for (let r = 8; r <= 24; r++) put(g, r, 24, 2);       // 右の面取り（暗）
	// 接地側の影＝境目を全幅の直線にしない（真横に走る線は「箱に液体が半分」に見える）
	rect(g, 22, 8, 23, 23, 2);
	rect(g, 21, 11, 21, 23, 2);
	// 上面の照り返し＝白（5）は3ドットだけ・面の角に沿って折る（長い白帯はシールに見える）
	rect(g, 7, 9, 7, 11, 5);
	put(g, 8, 9, 5);
	// 割れ目（石らしさ）＝上面との境目から下の影まで**通す**（宙に浮いた線は傷に見える）。
	// 隣り合うドットで繋げて描く＝斜め1ドットの線は拡大すると点々になり「汚れ」になる。
	for (const [r, c] of [[11, 13], [12, 13], [13, 13], [13, 12], [14, 12], [15, 12],
		[16, 13], [17, 13], [18, 13], [19, 12], [20, 12], [21, 12]]) put(g, r, c, 2);
	// 枝＝本流から右下へ短く折れる（Y字＝割れた石に読める）。長く伸ばすと2ドットずつの
	// 階段が「棚」に見える∴6ドットで止める。
	for (const [r, c] of [[15, 14], [15, 15], [16, 15], [16, 16], [17, 16], [17, 17]]) put(g, r, c, 2);
	strokeOutside(g);
	return g;
}

// ── 宝箱（CHEST 'C'）── ink 22×20（rows 5..24 / cols 5..26）──────────
// 蓋＋胴＋鉄帯＋金の錠。2フレーム＝わずかに明るくなる（従来と同じ「ちらつき」）。
// 本体は rows 6..23 / cols 6..25。
function chestGrid() {
	const g = blank();
	rrect(g, 6, 6, 12, 25, 2, 3);          // 蓋（中間）
	rect(g, 7, 8, 8, 23, 4);               // 蓋の天面（明）
	rect(g, 12, 6, 12, 25, 2);             // 蓋と胴の合わせ目（暗）
	rect(g, 13, 6, 23, 25, 3);             // 胴（中間）
	rect(g, 21, 6, 23, 25, 2);             // 底（暗）＝接地の影
	rect(g, 6, 9, 23, 10, 2);              // 鉄帯（左）
	rect(g, 6, 21, 23, 22, 2);             // 鉄帯（右）
	rrect(g, 10, 13, 17, 18, 1, 5);        // 金の錠（合わせ目の手前に描く＝錠が上）
	rect(g, 13, 15, 14, 16, 1);            // 鍵穴（縦2×横2の穴）
	put(g, 15, 15, 1); put(g, 15, 16, 1);
	rect(g, 7, 11, 7, 12, 4);              // 蓋の照り返し
	strokeOutside(g);
	return g;
}

// ── 床ボタン（BUTTON 'S'）── ink 18×18（rows 7..24 / cols 7..24）─────
// ユーザー指摘1（2026-09-07）＝「石が上に乗ったら押されそうな、スイッチボタンみたいな見た目に」
// ＝旧絵は灰色一色で床/石と同系色＝「特別な物」に見えなかった。
// ユーザー指摘2（同日・指摘1への直しが逆だった）＝「押された状態になったら光るイメージ。今は
// 逆になってる気がする。光ってない状態も目立つようにはしたい。」＋「色合いは今までのまま
// （緑系）がよかった」＝**未押下＝目立つがくすんだ緑（光っていない）／押下＝明るく光る緑**。
// ユーザー指摘3（同日・指摘2への直しが「のっぺり」だった）＝「押されてない時、スイッチの
// 押される側の部分は上に飛び出してて、そこに石が乗ると凹んで押された状態になる。それを
// 表現してほしい。今は押されてない時にのっぺりしちゃってる。押されたら緑部分は逆に凹むん
// だけど、それによってスイッチ自体はオンになって光る。」＝**光の当て方（凸／凹）で「飛び
// 出ている／沈んでいる」を描き分ける**（色を変えるだけでは平面に見える）。光源は他の絵と
// 同じ左上（block/chest と同じ規則）＝凸（未押下）は左上が明・右下が暗、
// 凹（押下）はその逆＝左上が暗・右下が明（内側の壁が光を受ける向きが反転する）。
// ∴プレート（床に埋まる金属の台）＋受け皿（暗い窪み）＋緑の押しボタンの3層構造は維持し、
// キャップに凸/凹の陰影を追加＝frame0 = 未押下（凸・くすんだ緑・受け皿との間に段差の縁）／
// frame1 = 押下（凹・受け皿を埋め尽くし縁が消える＋内側が光って見える）。
// 本体（プレート）は rows 8..23 / cols 8..23。
function buttonGrids() {
	const base = () => {
		const g = blank();
		rrect(g, 8, 8, 23, 23, 3, 2);      // プレート本体（暗い金属＝床に埋まる台）
		rrect(g, 9, 9, 22, 22, 2, 3);      // プレートのベゼル（1段明るい縁）
		disc(g, 15, 15, 6, 1);             // 受け皿（暗い窪み）＝ボタンが座る穴
		return g;
	};
	const up = base();
	disc(up, 15, 15, 5, 5);                // キャップ地（くすんだ緑＝目立つが光っていない）＝受け皿より小さく段差の縁が覗く
	disc(up, 17, 17, 3, 4);                // 凸の陰（右下＝光源と逆側が暗い）
	disc(up, 13, 13, 2, 6);                // 凸のハイライト（左上＝光源側が明るい・浮き上がって見える）
	strokeOutside(up);

	const down = base();
	disc(down, 15, 15, 6, 8);              // キャップ地（押下・彩度の高い緑）＝受け皿を埋め尽くし段差の縁が消える
	disc(down, 13, 13, 2, 4);              // 凹の陰（左上＝光源側の内壁が逆に暗くなる＝沈んだ証）
	disc(down, 17, 17, 3, 7);              // 光（右下＝内壁が光を受けて明るく光る）
	strokeOutside(down);
	return [up, down];
}

// ── レバー（SWITCH 'Y' / 色スイッチ）── ink 20×18（rows 8..25 / cols 6..25）
// frame0 = OFF（左倒し・玉は白）／frame1 = ON（右倒し・玉は差し色で光る）。
// 台座は rows 20..24 / cols 7..24、玉は中心 row 12・半径 3（＋輪郭で ink 上端 8）。
function leverGrids() {
	const make = (knobCol, knobColor) => {
		const g = blank();
		rrect(g, 20, 7, 24, 24, 2, 3);      // 台座（明るい面）
		rect(g, 22, 8, 24, 23, 2);          // 台座の胴（暗）
		rect(g, 21, 12, 21, 19, 4);         // 軸受け（黒い溝）
		line(g, 20, 15, 13, knobCol, 5, 2); // 軸
		disc(g, 12, knobCol, 3, knobColor); // 握り玉
		strokeOutside(g);
		return g;
	};
	return [make(10, 6), make(21, 7)];
}

const leverFrames = leverGrids();
const buttonFrames = buttonGrids();

// 同名で従来の絵を置き換える（呼び出し側は makeSprite('chest', …) のまま）。
// ⚠ ここに足したら、元の 12×16／8×8 のリテラルは消すこと＝同じ名前の絵が2箇所に
//    あると「直したのに変わらない」事故になる（[[blade-tile-sprite-single-source]]）。
export const OBJ32_SPRITES = {
	block:     [blockGrid()],
	// 宝箱の2コマ目は「木地だけ」を明るくする＝鉄帯(2)・合わせ目(2)・輪郭(1)は据え置く。
	// 2→3・3→4 まで一緒にずらすと帯と合わせ目が消えて別の物に見える（拡大目視で判定）。
	chest:     [chestGrid(), swap(chestGrid(), { 3: 4 })],
	button:    buttonFrames,
	lever:     leverFrames,
	switchRed: leverFrames,   // レバーと同形・パレットだけ違う（従来どおり）
	switchBlu: leverFrames,
};
