/* TODO: refactor status system so duration matches level

	Duration options:
		-infinite
		-single turn
		-matches level, both count down every turn
		-matches level, exponential fall off

	status should mention decrement *if* not infinite

*/

class StatusIcon{
	constructor(sprite, monster, isBigSprite){
		this.monster = monster;
		this.initSprite(sprite);
	}

	initSprite(sprite){
		this.sprite = new PIXI.Sprite(draw.getIconTexture(sprite));
		this.monster.getContainer().addChild(this.sprite);
	}

	setSprite(sprite){
		this.sprite.texture = draw.getTexture(sprite);
		console.log(sprite);
	}
}

class Status{
	constructor(sprite, monster, duration, bigSpriteIndex){
		this.monster = monster;
		this.spriteIndex = sprite;
		this.spriteIcon = new StatusIcon(sprite, monster);
		if(bigSpriteIndex){
			this.bigSprite = new StatusIcon(bigSpriteIndex, monster, true);
			this.bigSpriteIndex = bigSpriteIndex
		}
		this.duration = duration;
		this.ttl = duration;
		this.level=1;
		this.dispellable=true;
		this.canStack = !!this.constructor.canStack;

		// text 
		this.textContainer = new PIXI.Container();
		this.monster.getContainer().addChild(this.textContainer);
	}

	cleanupText(){
		this.textContainer.removeChildren();
	}

	setTextPosition(x,y){
		this.textContainer.x = x;
		this.textContainer.y = y;
	}

	drawTinyText(text){
		this.cleanupText();

		text += "";
		text = text.toUpperCase();

		for(let i=0;i<text.length;i++){
			const code = text.charCodeAt(i);
			const sprite = new PIXI.Sprite(draw.getTinyverseTexture(code));
			sprite.x = 4*i;
			if(text.length == 1){
				// centering over icons
				sprite.x++;
			}
			if(this.tint){
				sprite.tint = this.tint;
			}
			this.textContainer.addChild(sprite);
		}
	}

	highlight(){
		return `<span class="highlight">(${this.level})</span>`;
	}

	hasMultipleStacks(){
		return this.canStack && this.level > 1;
	}

	hasMultipleDisplayCount(){
		return this.hasMultipleStacks() || (this.displayTtl && this.ttl > 1);
	}

	getIconDisplayCount(){
		if(this.hasMultipleDisplayCount()){
			if(this.hasMultipleStacks()){
				return this.level;
			}else{
				return this.ttl;
			}
		}else{
			return 0;
		}
	}

	setBigSprite(sprite){
		this.bigSprite.setSprite(sprite);
	}

	setIconPosition(x, y){
		this.spriteIcon.sprite.x = x;
		this.spriteIcon.sprite.y = y;
	}

	setDirection(direction){
		if(this.bigSpriteIndex){
			this.direction = direction;
			this.setBigSprite(this.bigSpriteIndex + direction);
		}
		
	}

	getDescription(){
		return this.description;
	}

	statusTick(){

	}

	statusBegin(){

	}

	statusEnd(){

	}

	destroy(expired){
		if(!this.destroyed){
			this.destroyed = true;
			this.statusEnd(expired);
			this.monster.getContainer().removeChild(this.spriteIcon.sprite);
			if(this.bigSpriteIndex){
				this.monster.getContainer().removeChild(this.bigSprite.sprite);
			}
			this.cleanupText();
			this.monster = null;
		}
	}
}

class StatusShocked extends Status{
	static description = "When damaged, redeal that damage to a nearby non-player unit in 2 tiles and removed Shocked.";

	constructor(monster){
		super(1, monster, -1);
		this.name = "Shocked";
		this.description = StatusShocked.description;
		this.tint = 0xffff00;
	}
}

class StatusIlluminated extends Status{
	static canStack = true;

	constructor(monster){
		super(5, monster, 30);
		this.name = "Illuminated";
		this.tint = 0xf800ff;
	}

	getDescription(){
		return `Increases damage taken from all sources by 1 per stack ${this.highlight()}.`;
	}
}

class StatusEclipsed extends Status{
	static canStack = true;

	constructor(monster){
		super(6, monster, 30);
		this.name = "Eclipsed";
		this.tint = 0xf800ff;
	}

	getDescription(){
		return `Reduces damage taken by 1 per stack ${this.highlight()}. Removed upon taking damage.`;
	}
}

class StatusStasis extends Status{

	constructor(monster){
		super(7, monster, -1);
		this.name = "Stasis";
		this.description = "";
		this.dispellable = false;
		this.displayTtl = true;
	}

	getDescription(){
		return `Can't act.  Damage taken reduced by 1
		<span class="highlight">(${map.getNumNonBossEnemies()})</span> for each other enemy. Awoken by the QUAKE.`;
	}

	statusEnd(){
		if(!this.monster.dead){
			if(this.monster.sprite){
				this.monster.sprite.animationSpeed = 0.05;
				this.monster.sprite.tint = 0xFFFFFF;
			}
		}
	}
			

	// statusEnd(){
	// 	if(!this.monster.dead){
	// 		if(this.monster.sprite){
	// 			this.monster.sprite.animationSpeed = 0.05;
	// 			this.monster.sprite.tint = 0xFFFFFF;
	// 		}
			
	// 		//shake and destroy all keys
	// 		map.getAllTiles().forEach(t=>{
	// 			const item = t.item;
	// 			if(item && item.fragile){
	// 				item.removeFromTile();
	// 				if(item.fragileSpawn){
	// 					t.createItem(item.fragileSpawn);
	// 				}
	// 			}
	// 		});
	// 		game.addScreenshake(20);
	// 		main.playSound("glassBreak");
	// 	}
	// }
}

class StatusBerserk extends Status{
	static canStack = true;

	constructor(monster){
		super(8, monster, 25);
		this.name = "Berserk";
        this.description = "Increases damage by 1 per stack.";
		this.tint = 0xFF0000;
	}

	getDescription(){
		return `Increases damage by 1 per stack ${this.highlight()}.`;
	}
}

class StatusTempered extends Status{
	static canStack = true;

	constructor(monster){
		super(15, monster, 7);
		this.name = "Tempered";
		this.tint = 0xff6700;
        this.description = "Reduces damage taken by 1 per stack.";
	}

	getDescription(){
		return `Reduces damage taken by 1 per stack ${this.highlight()}.`;
	}
}

class StatusFireImmunity extends Status{

	constructor(monster){
		super(14, monster, 5);
		this.name = "Fire Immunity";
        this.description = "Take 0 damage from FIRE and BURNING";
		this.tint = 0xff6700;
	}
}

class StatusVigor extends Status{
	static canStack = true;

	constructor(monster){
		super(9, monster, 25);
		this.name = "Vigor";
        this.description = "Doubles healing received.";
		this.tint = 0xFF0000;
	}
}

class StatusScent extends Status{
	static description = "Blood Droplets target this unit.";

	constructor(monster){
		super(2, monster, 25);
		this.name = "Scent";
        this.description = StatusScent.description;
		this.tint = 0xFF0000;
	}
}

class StatusEpiphany extends Status{
	static description = "Your next spell costs 1 less per stack.";
	static canStack = true;
	constructor(monster){
		super(16, monster, -1);
		this.name = "Epiphany";
        this.description = StatusEpiphany.description;
		this.tint = 0xffff00;
	}
}

class StatusEmpowered extends Status{
	static description = "Spell power increases by 1 per stack.";
	static canStack = true;
	constructor(monster){
		super(17, monster, 1);
		this.name = "Empowered";
        this.description = StatusEmpowered.description;
		this.tint = 0x00FFFF;
	}

	getDescription(){
		return `Spell power increases by 1 per stack. ${this.highlight()}.`;
	}
}

class StatusBolstered extends Status{
	static description = "Gain bonus HP which decays 1 per turn.";
	static canStack = true;
	constructor(monster){
		super(18, monster, -1);
		this.name = "Bolstered";
        this.description = StatusBolstered.description;
		this.tint = 0xFF0000;
	}

	statusTick(){
		this.monster.subtractHp(1);
		if(this.level <= 0){
			this.ttl = 0;
		}
	}
}

class StatusVengeful extends Status{
	static description = "Teleports to the Leyliner when hit.";
	static canStack = false;
	constructor(monster){
		super(23, monster, -1);
		this.name = "Vengeful";
        this.description = StatusVengeful.description;
		this.tint = 0xFF0000;
	}
}

class StatusSlowDeath extends Status{
	static description = "Dies peacefully when the counter reaches zero. Curses you if killed early.";
	static canStack = true;
	constructor(monster){
		super(24, monster, -1);
		this.name = "Slow Death";
        this.description = StatusSlowDeath.description;
		this.tint = 0xFF0000;
	}

	statusEnd(){
		const tile = this.monster.tile;
		this.monster.die();
	}

	statusTick(){
		if(this.level === 1){
			this.ttl = 0;
		}
		this.level--;
	}
}

//If duration is set to 1, it will be cleared before draw occurs, so it has no duration and is cleared after draw occurs.
class StatusOverDraw extends Status{
	static description = "Draw an additional card next turn per stack.";
	static canStack = true;
	constructor(monster){
		super(25, monster, -1);
		this.name = "Over Draw";
        this.description = StatusOverDraw.description;
		this.tint = 0xf800ff;
	}
}

class StatusFireStance extends Status{
	static description = "Reflects damage unto enemies attacking your shield.";
	static canStack = true;

	constructor(monster){
		super(26, monster, -1);
		this.name = "Fire Stance";
		this.description = StatusFireStance.description;
		this.tint = 0xff6700;
	}
}

class StatusBoss extends Status{

	constructor(monster){
		super(10, monster, -1);
		this.name = "Boss";
        this.description = "This monster acts at 2x speed (when active).";
		this.dispellable=false;
	}
}

class StatusStormed extends Status{
	static description = "Emits chain lightning every turn.";

	constructor(monster){
		super(4, monster, main.spellMap["Storm of Vengeance"].duration);
		this.name = "Stormed";
		this.description = StatusStormed.description;
		this.tint = 0xffff00;
	}

	statusTick(){
		const stormBolt = main.spellMap["Storm Bolt"];
		let stormTargetTile = this.monster.tile;
        if(stormTargetTile){
        	spells.effectsProcessor({
        		caster: this.monster,
        		targets: stormTargetTile,
        		effects: stormBolt.effects,
        		spellType: stormBolt.type,
        		spell: stormBolt
        	});  
        }
	}
}



class StatusBurning extends Status{
	static description = "Deal 1 damage per stack.  Loses half stacks each turn.";
	static canStack = true;

	constructor(monster){
		super(3, monster, -1);
		this.name = "Burning";
		this.description = StatusBurning.description;
		this.tint = 0xff6700;
	}

	statusTick(){
		this.monster.damage(
			this.level,
			"FIRE",
			/* source= */ {tile: this.monster.tile, type: "status"}
		);
		if(this.level === 1){
			this.ttl = 0;
		}
		this.level = Math.floor(this.level/2);
	}

	getDescription(monster){
		let description = StatusBurning.description;
		if(monster && monster.maxBurnStacks){
			description +=
				` (Highest Burning: <span style="color:orange;">${monster.maxBurnStacks}</span>)`;
		}
		return description;
	}
}

class StatusAlly extends Status{

	constructor(monster){
		super(13, monster, -1);
		this.name = "Ally";
		this.description = "This monster is friendly.";
		this.dispellable=false;
	}
}

class StatusDragonspawn extends Status{
	static canStack = true;
	static description = "Turns into a Dragon at the end of Dragonspawn.";

	constructor(monster){
		super(19, monster, -1);
		this.name = "Dragonspawn";
		this.description = StatusDragonspawn.description;
		this.dispellable = false;
		this.tint = 0x6eb11f;
	}

	statusEnd(expired){
		if(expired){
			const tile = this.monster.tile;
			this.monster.die();
			tile.createMonster("Dragon");
		}
	}

	statusTick(){
		if(this.level === 1){
			this.ttl = 0;
		}
		this.level--;
	}
}

class StatusPhoenixspawn extends Status{
	static canStack = true;
	static description = "Turns into a Phoenix at the end of Phoenixspawn.";

	constructor(monster){
		super(20, monster, -1);
		this.name = "Phoenixspawn";
		this.description = StatusPhoenixspawn.description;
		this.dispellable = false;
		this.tint = 0xe98134;
	}

	statusEnd(expired){
		if(expired){
			const tile = this.monster.tile;
			this.monster.die();
			tile.createMonster("Phoenix");
		}
	}
	statusTick(){
		if(this.level === 1){
			this.ttl = 0;
		}
		this.level--;
	}
}

class StatusShield extends Status{
	static description = "Blocks damage from one direction.";
	static canStack = true;

	constructor(monster){
		super(12,monster, -1, 208);
		this.name = "Shield";
		this.direction = 0;
		this.description = StatusShield.description;
		this.tint = 0xbbf5ff;
	}
}

class StatusHealth extends Status{
	static description = "Pseudo-status for displaying HP. Should never be seen.";
	static canStack = true;

	constructor(monster){
		super(21, monster, -1);
		this.name = "Shield";
		this.description = StatusHealth.description;
		this.tint = 0xff0000;
	}
}


