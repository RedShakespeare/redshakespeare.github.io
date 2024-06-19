class Item extends Drawable{
	constructor(spriteLocation, x, y){
		game.consoleLog(spriteLocation)
		super(spriteLocation, x, y);
		this.move(map.getTile(x,y));
		this.name = "...";
		this.description = "...";
	}

	getContainer(){
		return itemContainer;
	}

	stepOn(monster){}

	move(newTile){
		this.tile = newTile;
		this.tile.item = this;

		this.x = this.tile.x;
		this.y = this.tile.y;

		this.updateDrawPosition();
	}

	removeFromTile(){
        this.tile.item = null;
        this.cleanupSprite();
	}

	getDescription(){
		return this.description;
	}

	getName(){
		return this.name;
	}
}

class ItemChest extends Item{
    constructor(x,y){
        super(144, x, y);
		this.name = "Treasure Chest";
		this.description = "A locked chest containing equipment of unknown character.";
    }

    stepOn(monster){
        if(monster.isPlayer && player.keys){
        	player.keys--;
        	this.removeFromTile();
            // TODO: move to gear generation logic
            // const gearType = util.pickRandom([
            // 	GearDamageHelm,
            // 	GearDamageShoulders,
            // 	GearDamageFamiliar,
            // 	GearDamageChest,
            // 	GearDamageLegs,
            // 	GearDamageLeft,
            // 	GearDamageRight,
            // 	GearDamageHands,
            // 	GearDamageRing,
            // 	GearDamageFeet
            // ]);
            const newGear = gear.generateGear(game.levelIndex+1);
            newGear.equip();

            gear.displayChestPickup(newGear);
        }
    }
}

class ItemGlassKey extends Item{
	constructor(x,y){
		super(145, x, y);
		this.name = "Glass Key";
		this.description = "Opens a chest but breaks when a boss wakes up.";
		this.fragile = true;
	}

	stepOn(monster){
		if(monster.isPlayer){
        	this.removeFromTile();
			player.keys++;
		}
	}
}

class ItemPotion extends Item{
	constructor(x,y){
		let potionType = util.randomRange(0,6);
		super(224 + potionType, x, y);
		this.potionType = potionType;
		this.name = "Potion";
		this.description = "Immediately heal the Leyliner for half of their health.";
		this.fragile = true;
	}

	stepOn(monster){
		if(monster.isPlayer){
        	this.removeFromTile();
			//player.hp = Math.min(player.getMaxHp(), player.hp + Math.ceil(player.getMaxHp()/2));
			game.potions.push(this);
		}
	}

	getDescription(){
		switch(this.potionType){
			case 0:
				return "Heals 50% of missing HP.";
			case 1:
				return "Creates mana on each empty adjacent tile.";
			case 2:
				return "Draws 3 cards.";
			case 3:
				return "Adds 15 shield.";
			case 4:
				return "Teleports the caster at least 3 tiles away.";
			case 5:
				return "Teleports away all monsters within 2 tiles.";
			case 6:
				return "Creates 3 move cards in hand.";
		}
	}

	getName(){
		switch(this.potionType){
			case 0:
				return "Health Potion";
			case 1:
				return "Mana Potion";
			case 2:
				return "Draw Potion";
			case 3:
				return "Shield Potion";
			case 4:
				return "Teleport Potion";
			case 5:
				return "Panic Potion";
			case 6:
				return "Speed Potion";
		}
	}

	use(){
		switch(this.potionType){
			case 0:
				player.heal(
					Math.ceil((player.getMaxHp() - player.hp)/2)
				);
				break;
			case 1:
				player.tile.getAllNeighbors().forEach(t=>{
					if(cards.canPlaceMana(t)){
						t.createMana();
					}
				});
				break;
			case 2:
				cards.drawOneCard();
				cards.drawOneCard();
				cards.drawOneCard();
				break;
			case 3:

	            const status = player.addStatusByName("Shield", 15);

	            if(!status.direction){
	            	let direction = util.randomRange(0,	3);
	            	const strongestAttacker = map.monsters
	            		.filter(m=>!m.ally && m.canAttack(player.tile))
	            		.sort((a,b)=>b.calculateAttack()-a.calculateAttack())
	            		[0];
	            	if(strongestAttacker){
	            		direction = player.tile.getDirection(strongestAttacker.tile);
	            	}
	                status.setDirection(direction);
	            }
	            break;
	        case 4:
	        	player.teleportAway(3);
	        	break;
	        case 5:
	        	player.tile
	        		.getRadiusTiles(2)
	        		.filter(t=>t.monster && !t.monster.isPlayer)
	        		.forEach(t=>t.monster.teleportAway(4,player.tile));
	        	break;
	        case 6:
				cards.createCardInHand(`Move [${cards.starterType}]`);
				cards.createCardInHand(`Move [${cards.starterType}]`);
				cards.createCardInHand(`Move [${cards.starterType}]`);
	        	break;
		}
	}
}

class ItemTalisman extends Item{
	constructor(x,y){
		super(97, x, y);
		this.name = "Talisman";
		this.description = "Can be used to add one card to your collection.";
	}

	stepOn(monster){
		if(monster.isPlayer){
        	this.removeFromTile();
			game.talisman++;
			cards.openShop();
		}
	}
}

class ItemHeart extends Item{
	constructor(x,y){
		super(98, x, y);
		this.name = "Heart";
		this.description = "Increases current and maximum health by 15.";
	}

	stepOn(monster){
		if(monster.isPlayer){
        	this.removeFromTile();
			player.maxHp += 15;
			player.hp += 15;
		}
	}
}

class ItemHourglass extends Item{
	constructor(x,y){
		super(99, x, y);
		this.name = "Hourglass";
		this.description = `Permanently increases the number of cards drawn per "turn".`;
		this.fragile = true;
		this.fragileSpawn = ItemBrokenHourglass;
	}

	stepOn(monster){
		if(monster.isPlayer){
        	this.removeFromTile();
			game.gameDrawNum++;
			cards.drawOneCard();
		}
	}
}

class ItemBrokenHourglass extends Item{
	constructor(x,y){
		super(100, x, y);
		this.name = "Broken Hourglass";
		this.description = `Temporarily increases the number of cards drawn per "turn".`;
	}

	stepOn(monster){
		if(monster.isPlayer){
        	this.removeFromTile();
			game.bonusLevelDraw++;
			cards.drawOneCard();
		}
	}
}