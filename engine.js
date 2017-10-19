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
		this.actions = [];
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
		this.actions = [];
		game.actionLayer.removeChildren();
		this.sprite.x = this.x;
		this.sprite.y = this.y;
	}
	select() {
		this.state = SELECTED;
		this.filters = [shadowFilter];
		this.x = this.sprite.x;
		this.y = this.sprite.y;
		this.sprite.x = this.x - 1;
		this.sprite.y = this.y - 2;
		this.refreshActions([]);
	}

	nextAction(action) {
		this.actions.push(action);
		if (action.final) {
			game.applyActions(this.actions);
		} else {
			this.refreshActions();
		}
	}

	refreshActions() {
		game.actionLayer.removeChildren();
		let possibles = this.getPossibleActions(this.actions);
		for (let a of possibles) {
			a.initDisplay();
			game.actionLayer.addChild(a.display);
		}
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

	getPossibleActions() {
		return [];
	}
}

class Pawn extends Piece {
	constructor(player) {
		super(player, PAWN);
	}

	getPossibleActions(previousActions) {
		let actions = [];
		let dy = this.player === 0 ? 1 : -1;
		let coord = (previousActions.length) ? previousActions[previousActions.length - 1].coord : game.coordFromPiece(this);

		// Advance
		if (previousActions.length === 0) {
			let front = add(coord, 0, dy);
			if (front) {
				let targetPiece = game.board[front];

				let action = new GotoAction(this, front);
				if (targetPiece && targetPiece.player !== this.player) {
					action.victims.push(targetPiece);
				}
				if (!targetPiece || targetPiece.player !== this.player) {
					actions.push(action);
				}
			}
		}

		// Vault
		for (let dx = -1; dx <= 1; dx += 2) {
			let diagonal1 = add(coord, dx, dy);
			let diagonal2 = add(coord, dx * 2, dy * 2);
			if (diagonal1 && game.board[diagonal1] && diagonal2) {
				let targetPiece = game.board[diagonal2];
				let action = new VaultToAction(this, coord, diagonal2);
				if (targetPiece && targetPiece.player !== this.player) {
					action.victims.push(targetPiece);
				}
				if (!targetPiece || targetPiece.player !== this.player) {
					actions.push(action);
				}
			}
		}

		//Confirm
		if (previousActions.length) {
			actions.push(new ConfirmAction(this, coord));
		}
		return actions;
	}

}
class Bishop extends Piece {
	getPossibleActions(previousActions) {
		let actions = [];
		let coord = game.coordFromPiece(this);
		for (let dx = -1; dx <= 1; dx += 2) {
			for (let dy = -1; dy <= 1; dy += 2) {
				let distance = 1;
				let currentCoord = add(coord, dx, dy);
				while (currentCoord) {
					let targetPiece = game.board[currentCoord];
					if (targetPiece) {
						if (distance === 1 && targetPiece.player !== this.player) {
							//Kill
							let a = new GotoAction(this, currentCoord);
							a.victims.push(targetPiece);
							actions.push(a);
						} else {
							//Switch
							actions.push(new SwitchAction(this, targetPiece));
						}

						break;
					} else {
						//Goto
						actions.push(new GotoAction(this, currentCoord));
					}
					currentCoord = add(currentCoord, dx, dy);
					distance++;
				}
			}
		}
		return actions;
	}
	constructor(player) {
		super(player, BISHOP);
	}
}

class Knight extends Piece {
	constructor(player) {
		super(player, KNIGHT);
	}

	getPossibleActions(previousActions) {
		let actions = [];
		let coord = game.coordFromPiece(this);
		let targets = [
			add(coord, 2, -1),
			add(coord, 2, 1),
			add(coord, -1, 2),
			add(coord, 1, 2),
			add(coord, -2, -1),
			add(coord, -2, 1),
			add(coord, -1, -2),
			add(coord, 1, -2)
		];
		for (let target of targets) {
			if (target) {
				let targetPiece = game.board[target];
				if (targetPiece && targetPiece.player != this.player) {
					let action = new SmashToAction(this, target);
					actions.push(action);
					action.victims.push(targetPiece);
				} else if (!targetPiece) {
					actions.push(new SmashToAction(this, target));
				}
			}
		}


		return actions;
	}

}
class Castle extends Piece {
	constructor(player) {
		super(player, CASTLE);
	}

	getPossibleActions(previousActions) {
		let actions = [];
		let coord = game.coordFromPiece(this);
		let dirs = [
			{ x: 0, y: -1 },
			{ x: 0, y: 1 },
			{ x: -1, y: 0 },
			{ x: 1, y: 0 },
		];
		for (let dir of dirs) {
			let next = add(coord, dir.x, dir.y);
			if (next) {
				let target = game.board[next];
				//TODO: rethink
			}
		}
		return actions;
	}
}
class Queen extends Piece {
	constructor(player) {
		super(player, QUEEN);
	}

	getPossibleActions(previousActions) {
		let actions = [];
		let coord = game.coordFromPiece(this);

		//Spin attack
		let around = [
			{ x: 0, y: -1 },
			{ x: 0, y: 1 },
			{ x: -1, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: -1 },
			{ x: 1, y: 1 },
			{ x: -1, y: -1 },
			{ x: -1, y: 1 }
		];
		let victims = [];
		for (let dir of around) {
			let target = add(coord, dir.x, dir.y);
			if (target) {
				let targetPiece = game.board[target];
				if (targetPiece) {
					victims.push(targetPiece);
				}
			}
		}
		if (victims.length) {
			let action = new SpinAttackAction(this, coord);
			action.victims = victims;
			actions.push(action);
		}

		//Move to
		for (let dir of around) {
			let dx = dir.x, dy = dir.y;
			let currentCoord = add(coord, dx, dy);
			while (currentCoord) {
				let targetPiece = game.board[currentCoord];
				if (targetPiece) {
					if (targetPiece.player !== this.player) {
						//Kill
						let a = new GotoAction(this, currentCoord);
						a.victims.push(targetPiece);
						actions.push(a);
					}
					break;
				} else {
					//Goto
					actions.push(new GotoAction(this, currentCoord));
				}
				currentCoord = add(currentCoord, dx, dy);

			}
		}

		return actions;
	}
}
class King extends Piece {
	constructor(player) {
		super(player, KING);
	}
	getPossibleActions(previousActions) {
		let actions = [];
		let coord = game.coordFromPiece(this);
		return actions;
	}
}

function addPiece(player, clazz, coord) {
	if (!add(coord, 0, 0)) {
		return;
	}
	let piece = game.board[coord];
	if (piece) {
		removePiece(piece);
	}
	game.board[coord] = game.initPiece(player, clazz);
	game.initPieceGraphic(game.board[coord]);
}

function removePiece(piece) {
	let coord = game.coordFromPiece(piece);
	if (coord) {
		game.board[coord] = null;
	}
	game.pieces = game.pieces.filter((v) => v !== piece);
	game.pieceLayer.removeChild(piece.sprite);

}

class Action {
	constructor(piece, coord) {
		this.piece = piece;
		this.coord = coord;
		this.victims = [];
		this.fromCoord = game.coordFromPiece(piece);
		this.source = game.coordToPosition(this.fromCoord);
		this.destination = game.coordToPosition(this.coord);
	}

	animate(progress) {
		let p = progress / this.animationLength;
		this.piece.sprite.x = lerp(this.source.x, this.destination.x, p);
		this.piece.sprite.y = lerp(this.source.y, this.destination.y, p);
	}

	apply() {
		game.board[this.fromCoord] = null;
		game.board[this.coord] = this.piece;
		this.piece.sprite.position.copy(this.destination);
		for (let victim of this.victims) {
			removePiece(victim);
		}
	}

	get final() { return true; }
	get animationLength() { return 300; }

	initDisplay() {
		this.display = new PIXI.Container();
		let source = this.source;
		let destination = this.destination;
		let offset = CELL_SIZE / 2;
		let g = new PIXI.Graphics();
		g.lineStyle(4, this.victims.length ? 0xFF0000 : (this.final ? 0x00FF00 : 0x0000FF), 0.8);
		g.moveTo(source.x + offset, source.y + offset);
		g.lineTo(destination.x + offset, destination.y + offset);
		g.drawCircle(destination.x + offset, destination.y + offset, offset);
		this.display.addChild(g);
		this.display.hitArea = new PIXI.Rectangle(destination.x, destination.y, CELL_SIZE, CELL_SIZE);
		this.display.interactive = true;
		this.display.touchstart = this.display.mousedown = chooseAction;
		this.display.action = this;
	}
}

class SpinAttackAction extends Action {
	constructor(piece, coord) {
		super(piece, coord);
	}

	animate(progress) {
		let p = progress / this.animationLength;
		this.piece.sprite.pivot.set(CELL_SIZE);
		this.piece.sprite.x = this.source.x + CELL_SIZE / 2;
		this.piece.sprite.y = this.source.y + CELL_SIZE / 2;
		this.piece.sprite.rotation = p * Math.PI * 2;
	}

	apply() {
		super.apply();
		this.piece.sprite.rotation = 0;
		this.piece.sprite.pivot.set(0);
	}
}

class ConfirmAction extends Action {
	get animationLength() { return 0; }
	initDisplay() {
		this.display = new PIXI.Container();
		let destination = game.coordToPosition(this.coord);
		let offset = CELL_SIZE / 2;
		let g = new PIXI.Graphics();
		g.lineStyle(4, this.victims.length ? 0xFF0000 : (this.final ? 0x00FF00 : 0x0000FF), 0.8);
		g.drawCircle(destination.x + offset, destination.y + offset, offset);
		this.display.addChild(g);
		this.display.hitArea = new PIXI.Rectangle(destination.x, destination.y, CELL_SIZE, CELL_SIZE);
		this.display.interactive = true;
		this.display.mousedown = chooseAction;
		this.display.action = this;
	}
}
class GotoAction extends Action {
}
class SmashToAction extends Action {
	constructor(piece, coord) {
		super(piece, coord);
		this.pushes = [];
		let push = [
			{ x: 0, y: -1 },
			{ x: 0, y: 1 },
			{ x: -1, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: -1 },
			{ x: 1, y: 1 },
			{ x: -1, y: -1 },
			{ x: -1, y: 1 }
		];
		for (let dir of push) {
			let target = add(this.coord, dir.x, dir.y);
			if (target) {
				let piece = game.board[target];
				if (piece) {
					let next = add(target, dir.x, dir.y);
					if (next && !game.board[next]) {
						this.pushes.push({ piece, from: target, to: next });
					}
				}
			}
		}
	}
	apply() {
		super.apply();
		for (let push of this.pushes) {
			this.push(push.piece, push.from, push.to);
		}
	}
	push(piece, from, to) {
		game.board[from] = null;
		game.board[to] = piece;
		piece.sprite.position.copy(game.coordToPosition(to));
	}

	get animationLength() { return 600; }

	animate(progress) {
		let p = progress / this.animationLength;
		if (p < 0.5) {
			this.piece.sprite.x = lerp(this.source.x, this.destination.x, p * 2);
			this.piece.sprite.y = lerp(this.source.y, this.destination.y, p * 2);
		} else {
			this.piece.sprite.x = this.destination.x;
			this.piece.sprite.y = this.destination.y;
		}
		if (p >= 0.5) {
			for (let pushed of this.pushes) {
				let source = game.coordToPosition(pushed.from);
				let destination = game.coordToPosition(pushed.to);
				pushed.piece.sprite.x = lerp(source.x, destination.x, 2 * (p - 0.5));
				pushed.piece.sprite.y = lerp(source.y, destination.y, 2 * (p - 0.5));
			}
		}
	}
}
class SwitchAction extends Action {
	constructor(piece, targetPiece) {
		super(piece, game.coordFromPiece(targetPiece));
		this.targetPiece = targetPiece;
	}
	apply() {
		super.apply();
		game.board[this.fromCoord] = this.targetPiece;
		this.targetPiece.sprite.position.copy(this.source);
	}
	animate(progress) {
		let p = progress / this.animationLength;
		this.piece.sprite.x = lerp(this.source.x, this.destination.x, p);
		this.piece.sprite.y = lerp(this.source.y, this.destination.y, p);
		this.targetPiece.sprite.x = lerp(this.destination.x, this.source.x, p);
		this.targetPiece.sprite.y = lerp(this.destination.y, this.source.y, p);
	}
}
class VaultToAction extends Action {
	constructor(piece, from, to) {
		super(piece, to);
		this.fromCoord = from;
		this.source = game.coordToPosition(this.fromCoord);
	}
	get final() { return this.victims.length; }
}

function chooseAction() {
	selected.nextAction(this.action);
}

function add(coord, dx, dy) {
	let col = coord[0];
	let row = coord[1];
	let x = ALPHA.indexOf(col) + dx;
	let y = row - 1 + dy;

	if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
		return null;
	}

	return ALPHA[x] + (y + 1);
}

class Game {
	constructor() {
		this.initBoard();
		this.initGraphics();
	}

	initPiece(player, clazz) {
		let piece = new clazz(player);
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
		return null;
	}

	initBoard() {
		this.board = {};
		this.pieces = [];

		for (let i = 0; i < 2; ++i) {
			let row = [1, 8][i];
			this.board['a' + row] = this.initPiece(i, Castle);
			this.board['b' + row] = this.initPiece(i, Knight);
			this.board['c' + row] = this.initPiece(i, Bishop);
			this.board['d' + row] = this.initPiece(i, King);
			this.board['e' + row] = this.initPiece(i, Queen);
			this.board['f' + row] = this.initPiece(i, Bishop);
			this.board['g' + row] = this.initPiece(i, Knight);
			this.board['h' + row] = this.initPiece(i, Castle);
		}
		for (let i = 0; i < 2; ++i) {
			let row = [2, 7][i];
			for (let col of ALPHA) {
				this.board[col + row] = this.initPiece(i, Pawn);
			}
		}

		this.turn = WHITE;
		this.phase = PHASE.PLAY;
	}

	initGraphics() {
		this.layer = new PIXI.Container();
		this.initGridGraphics();
		this.initPieceGraphics();
		this.initActionLayer();
	}

	initActionLayer() {
		this.actionLayer = new PIXI.Container();
		this.actionLayer.position.copy(this.grid);
		this.actionLayer.scale.copy(this.grid.scale);
		this.layer.addChild(this.actionLayer);
	}
	initPieceGraphic(piece) {
		this.pieceLayer.addChild(piece.sprite);
		piece.sprite.width = CELL_SIZE;
		piece.sprite.height = CELL_SIZE;
		let coord = this.coordFromPiece(piece);
		piece.sprite.position.copy(this.coordToPosition(coord));
	}
	initPieceGraphics() {
		let pieceLayer = this.pieceLayer = new PIXI.Container();

		for (let piece of this.pieces) {
			this.initPieceGraphic(piece);
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
				cell.touchstart = cell.mouseover = mouseOverCell;
				cell.touchendoutside = cell.mouseout = mouseOutCell;
				cell.touchend = cell.mousedown = mouseDownCell;

				cell.coord = ALPHA[i] + (k + 1);
			}
		}
		this.layer.addChild(grid);

		grid.x = WIDTH / 2 - grid.width / 2;
		grid.scale.set((HEIGHT - 120) / grid.height);
		grid.y = HEIGHT / 2 - grid.height / 2;

		app.stage.hitArea = new PIXI.Rectangle(0, 0, app.screen.width, app.screen.height);
		app.stage.interactive = true;
		app.stage.rightdown = clearSelection;

		this.grid = grid;
	}


	applyActions(actions) {
		this.phase = PHASE.ANIMATE;
		this.actionIndex = 0;
		this.progress = 0;
		this.actions = actions;
		clearSelection();
	}
}

function clearSelection() {
	if (selected) {
		selected.deselect();
		selected = null;
		//TODO: this isnt mvc
		if (inside) {
			inside.mouseover();
		}
	}
}

var game = new Game();
app.stage.addChild(game.layer);
var time = Date.now();

function animate() {
	let delta = Date.now() - time;
	time = Date.now();
	//TODO: this is a wtf mess
	if (game.phase == PHASE.ANIMATE) {
		game.progress += delta;
		let action = game.actions[game.actionIndex];
		if (game.progress >= action.animationLength) {
			action.apply();
			game.actionIndex++;
			game.progress %= action.animationLength;
		}
		action = game.actions[game.actionIndex];

		if (!action) {
			game.phase = PHASE.PLAY;
			game.turn ^= 1;
			if (inside) {
				inside.mouseover();
			}
		} else {
			action.animate(game.progress);
		}
	}

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

function lerp(a, b, u) {
	return a + (b - a) * u;
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
	if (inside === this) {
		inside = null;
	}
	if (!selected && piece && piece.state === GLOWING) {
		piece.reset();
	}
}

function mouseDownCell() {
	let piece = game.board[this.coord];
	if (!selected && piece && piece.state === GLOWING) {
		selected = piece;
		piece.select();
	}
}

//debug
addPiece(1, Castle, 'd4')

addPiece(1, Castle, 'e5')

addPiece(1, Castle, 'c3')