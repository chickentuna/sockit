const WIDTH = 974;
const HEIGHT = 548;

var app = new PIXI.Application({
	width: WIDTH,
	height: HEIGHT,
	transparent: false,
	resolution: 2,
	backgroundColor: 0xBAAB88
});
app.view.addEventListener('contextmenu', (e) => { e.preventDefault(); });

const COLOR_DARK = 0xb58863;
const COLOR_LIGHT = 0xf0d9b5;

const PAWN = 0;
const BISHOP = 1;
const KNIGHT = 2;
const CASTLE = 3;
const QUEEN = 4;
const KING = 5;

const TEXTURE_POSITION = {
	[PAWN]: 5,
	[BISHOP]: 2,
	[KNIGHT]: 3,
	[CASTLE]: 4,
	[QUEEN]: 1,
	[KING]: 0
};

const BOARD_SIZE = 8;

const WHITE = 0;
const BLACK = 1;

const ALPHA = 'abcdefgh';

const PHASE = {
	PLAY: 0,
	ANIMATE: 1
};
const CELL_SIZE = 60;

var PIXEL;
var PIECES;
function initTextures() {
	let square = new PIXI.Graphics();
	square.beginFill(0xFFFFFF, 1);
	square.drawRect(0, 0, 1, 1);
	square.endFill();
	PIXEL = square.generateCanvasTexture();

	let sheet = PIXI.BaseTexture.fromImage('sheet.png');
	let w = 640 / 6;
	let h = 213 / 2;
	let sprites = {
		[WHITE]: {},
		[BLACK]: {}
	};
	for (let p = PAWN; p <= KING; ++p) {
		for (let k = 0; k < 2; ++k) {
			sprites[k][p] = new PIXI.Texture(sheet, new PIXI.Rectangle(w * TEXTURE_POSITION[p], h * k, w, h));
		}
	}
	PIECES = sprites;
}
initTextures();

const IDLE = 0;
const GLOWING = 1;
const SELECTED = 2;

class Piece {
	constructor(player, type) {
		this.state = IDLE;
		this.type = type;
		this.player = player;
		this.sprite = new PIXI.Sprite(PIECES[player][type]);
	}
	toString() {
		return ['white', 'black'][this.player] + ' ' + ['PAWN', 'BISHOP', 'KNIGHT', 'CASTLE', 'QUEEN', 'KING'][this.type].toLowerCase();
	}
	get name() { return this.toString(); }
	get filters() { return this.sprite.filters; }
	set filters(v) { this.sprite.filters = v; }

	deselect() {
		this.filters = [];
		this.state = IDLE;
	}
	select() {
		this.state = SELECTED;
		this.filters = [shadowFilter];
	}

	over() {
		this.state = GLOWING;
		//TODO: filters should bedealt with in render loop, not state logic
		this.filters = [new PIXI.filters.GlowFilter(15, 2, 1, 0xFF0000, 0.5)];
	}

	reset() {
		this.filters = [];
		this.state = IDLE;
	}
}

class Game {
	initPiece(player, type) {
		let piece = new Piece(player, type);
		this.pieces.push(piece);
		return piece;
	}

	coordToPosition(coord) {
		let letter = coord[0];
		return new PIXI.Point(ALPHA.indexOf(letter) * CELL_SIZE, (coord[1] - 1) * CELL_SIZE);

	}

	coordFromPiece(piece) {
		for (let key in this.board) {
			if (this.board[key] === piece) {
				return key;
			}
		}
	}

	initBoard() {
		this.board = {};
		this.pieces = [];

		for (let i = 0; i < 2; ++i) {
			let row = [1, 8][i];
			this.board['a' + row] = this.initPiece(i, CASTLE);
			this.board['b' + row] = this.initPiece(i, KNIGHT);
			this.board['c' + row] = this.initPiece(i, BISHOP);
			this.board['d' + row] = this.initPiece(i, QUEEN);
			this.board['e' + row] = this.initPiece(i, KING);
			this.board['f' + row] = this.initPiece(i, BISHOP);
			this.board['g' + row] = this.initPiece(i, KNIGHT);
			this.board['h' + row] = this.initPiece(i, CASTLE);
		}
		for (let i = 0; i < 2; ++i) {
			let row = [2, 7][i];
			for (let col of ALPHA) {
				this.board[col + row] = this.initPiece(i, PAWN);
			}
		}

		this.turn = WHITE;
		this.phase = PHASE.PLAY;
	}

	initGraphics() {
		this.layer = new PIXI.Container();
		this.initGridGraphics();
		this.initPieceGraphics();
	}

	initPieceGraphics() {
		let pieceLayer = this.pieceLayer = new PIXI.Container();

		for (let piece of this.pieces) {
			pieceLayer.addChild(piece.sprite);
			piece.sprite.width = CELL_SIZE;
			piece.sprite.height = CELL_SIZE;
			let coord = this.coordFromPiece(piece);
			piece.sprite.position.copy(this.coordToPosition(coord));
		}
		this.layer.addChild(pieceLayer);
		pieceLayer.position.copy(this.grid);
		pieceLayer.scale.copy(this.grid.scale);
	}

	initGridGraphics() {
		let grid = new PIXI.Container();

		for (let i = 0; i < 8; ++i) {
			for (let k = 0; k < 8; ++k) {
				var cell = new PIXI.Sprite(PIXEL);
				cell.x = i * CELL_SIZE;
				cell.y = k * CELL_SIZE;
				cell.scale.set(CELL_SIZE);
				cell.tint = (i + k) % 2 === 0 ? COLOR_LIGHT : COLOR_DARK;
				grid.addChild(cell);
				cell.interactive = true;
				cell.mouseover = mouseOverCell;
				cell.mouseout = mouseOutCell;
				cell.mousedown = mouseDownCell;
				cell.mouseup = mouseUpCell;
				cell.mouseupoutside = mouseUpOutsideCell;
				cell.coord = ALPHA[i] + (k + 1);
			}
		}
		this.layer.addChild(grid);

		grid.x = WIDTH / 2 - grid.width / 2;
		grid.scale.set((HEIGHT - 120) / grid.height);
		grid.y = HEIGHT / 2 - grid.height / 2;

		app.stage.hitArea = new PIXI.Rectangle(0, 0, app.screen.width, app.screen.height);
		app.stage.interactive = true;
		app.stage.rightdown = function() {
			if (selected) {
				selected.deselect();
				selected = null;
				if (inside) {
					inside.mouseover();
				}
			}
		};

		this.grid = grid;
	}

	constructor() {
		this.initBoard();
		this.initGraphics();
	}
}

game = new Game();
app.stage.addChild(game.layer);

function animate() {
	app.render();
	requestAnimationFrame(animate);
}

document.getElementById("canvasZone").appendChild(app.view);

/**
 * Gets the percentage position in [a;b] of number v
 */
function unlerp(a, b, v) {
	return (v - a) / (b - a);
}


//TODO: Filter manager
var glowFilter = new PIXI.filters.GlowFilter(15, 2, 1, 0xFF0000, 0.5);
var shadowFilter = new PIXI.filters.DropShadowFilter();
var selected = null;
var inside = null;


function mouseOverCell() {
	let piece = game.board[this.coord];
	inside = this;
	
	if (!selected && piece && piece.state === IDLE && game.phase === PHASE.PLAY && game.turn === piece.player) {
		piece.over();
	}
}

function mouseOutCell() {
	let piece = game.board[this.coord];
	if (inside === this)  {
		inside = null;
	}
	if (!selected && piece && piece.state === GLOWING) {
		piece.reset();
	}
}

function mouseDownCell() {
	let piece = game.board[this.coord];
	if (!selected && piece && piece.state === GLOWING) {
		piece.select();
		selected = piece;
	}
}

function mouseUpCell() {

}

function mouseUpOutsideCell() {
}
