class Mana extends Drawable{
	constructor(type, x, y){
		const spriteLocation = colors[type].manaSprite;
		super(spriteLocation, x, y);
		this.move(map.getTile(x,y));
		this.type = type;

		if(!game.manaId) game.manaId = 0;
		this.id = game.manaId++;
	}

	// this mana will be consumed to pay for the current spell
	// when that spell is cast (currently targeting)
	willBeConsumed(){
		return game.animatingMana.indexOf(this) > -1;
	}

	drawUpdate(delta, elapsed){
		let visible = Math.cos(elapsed/3) > 0;
		if(this.sprite){
			this.sprite.visible = visible;
		}
	}

	getContainer(){
		return manaContainer;
	}

	stepOn(monster){
		game.addEffect(this.type, monster.tile);
		monster.damage(
			1,
			this.type,
			/* source= */ {tile:this.tile, type: "mana"}
		);
		this.destroy();
	}

	destroy(){
		this.getTile().mana = null;
		this.cleanupSprite();
	}

	move(newTile){
		if(this.tile){
			this.tile.mana = null;
		}
		this.tile = newTile;
		this.tile.mana = this;

		this.x = this.tile.x;
		this.y = this.tile.y;

		this.updateDrawPosition();
	}
}

class FireMana extends Mana{
	constructor(x, y){
		super("FIRE", x, y);
	}
}

class MoonMana extends Mana{
	constructor(x, y){
		super("MOON", x, y);
	}
}

class ElecMana extends Mana{
	constructor(x, y){
		super("ELEC", x, y);
	}
}

class BloodMana extends Mana{
	constructor(x, y){
		super("BLOOD", x, y);
	}
}
class EarthMana extends Mana{
	constructor(x, y){
		super("EARTH", x, y);
	}
}
class RebirthMana extends Mana{
	constructor(x, y){
		super("REBIRTH", x, y);
	}
}
class DecayMana extends Mana{
	constructor(x, y){
		super("DECAY", x, y);
	}
}
class ChaosMana extends Mana{
	constructor(x, y){
		super("CHAOS", x, y);
	}
}
class FrostMana extends Mana{
	constructor(x, y){
		super("FROST", x, y);
	}
}
