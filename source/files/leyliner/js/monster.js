class Monster extends Drawable{
	constructor(monsterType, skipPlacement){
		super(
			[
				monsterType.sprite,
				monsterType.sprite+16
			],
			0,
			0
		);
		this.monsterType = monsterType;
		this.statuses = [];

		if(this.hasProperty("startsWithStatuses")){
			this.getProperty("startsWithStatuses").forEach(s=>{
				this.addStatusByName(s.type, s.stacks);
			});
		}

		this.maxHp = Math.ceil(this.monsterType.hp*game.monsterHpScale);
		this.hp = this.getMaxHp();
		if(this.monsterType.startHalfHp){
			this.hp = Math.ceil(this.hp/2);
		}
		this.desc = this.monsterType.description;
		this.range = this.monsterType.range || 1;
		if(this.hasProperty("static")){
			this.range = 0;
		}
		this.onHitStatus = this.monsterType.onHitStatus;

		this.damageValue = this.monsterType.damage || 0;
		this.cooldown = this.monsterType.cooldown;
		this.currentCD = 0;

		this.healthBar = PIXI.Sprite.from(PIXI.Texture.WHITE);
		this.healthBar.width = tileSize;
		this.healthBar.height = 2;
		this.healthBar.tint = 0xFF0000;
		this.getContainer().addChild(this.healthBar);

		if(!skipPlacement){
			this.move(map.randomPassableTile());
		}
		monsterContainer.addChild(this.getContainer());

		this.id = game.monsterCounter++;

		this.deadFlashCount = 0;

		this.maxBurnStacks = 0;

	}

	// TODO: consider reworking into statuses?
	hasProperty(propertyName){
		return this.monsterType.properties &&
			this.monsterType.properties[propertyName];
	}

	getProperty(propertyName){
		if(this.monsterType.properties){
			return this.monsterType.properties[propertyName]
		}
	}

	getMaxHp(){
		return this.maxHp;
	}

	teleportNearTile(target){
		const nearTiles = map.getAllTiles().filter(t => this.canMove(t) && !t.stairs)
			.sort((a,b)=>{
				const aDist = a.distance(target);
				const bDist = b.distance(target);
				return aDist - bDist;
			});

		if(nearTiles.length){
			this.move(nearTiles[0]);
		}
	}

	teleportAway(minDistance, fromTile){
		if(!minDistance) minDistance = 1;
		if(!fromTile) fromTile = this.tile;
		while(true){
			const newTile = util.shuffle(map.getAllTiles().filter(t=>{
				return t.passable && !t.monster && t.distance(fromTile) >= minDistance
			}))[0];
			if(newTile){
				this.move(newTile);
				break;
			}
			minDistance--;
			if(minDistance<=0){
				break;
			}
		}
	}

	drawStatuses(){
		let x = 0;
		let y = 0;

		this.statuses.sort((a,b)=>{
			return b.getIconDisplayCount() - a.getIconDisplayCount();
		});

		let showNumber = false;

		this.statuses.forEach((s,index)=>{
			s.cleanupText();

			if(index == 0 && this.statuses[0].hasMultipleDisplayCount()){
				showNumber = true;
				y=6;
			}

			// start stacking on right side
			if(showNumber && index == 2 || !showNumber && index == 3){
				x = 18;
				y = 0;
			}

			// keep stacking in columns shifting to the left
			if(x > 0 && y >= 18){
				x -= 6;
				y = 0;
			}

			s.setIconPosition(x,y);

			y += 6;
		});

		let firstStatus = this.statuses[0];
		if(firstStatus && firstStatus.hasMultipleDisplayCount()){
			firstStatus.drawTinyText(firstStatus.getIconDisplayCount());
		}


		if(!this.hpStatus){
			this.hpStatus = new StatusHealth(this);
		}
		this.hpStatus.level = this.hp;
		this.hpStatus.setIconPosition(6,17);
		this.hpStatus.drawTinyText(this.hp, 0xff0000);
		this.hpStatus.setTextPosition(12,17);

		// TODO: fix draw order of text and icons (not sure why text isn't naturally stacking on top)
	}

	canAttack(targetTile){
			//targetTile.passable && 
		return this.inAttackRange(targetTile) && this.hasAttackLOS(targetTile);
	}

	hasAttackLOS(targetTile){
		return this.hasProperty("ghostly") ||
			(
				true
			// removing wall checks and destroying walls instead

			//this.tile.hasLOS(targetTile) &&
			// for fairness, make sure a line can be drawn in both directions
			//spells.canDrawLine(this.tile, targetTile, /* skipEnds= */ true) && 
			//spells.canDrawLine(targetTile, this.tile, /* skipEnds= */ true)
		);
	}

	// can't go through walls (unless ghostly), so we can display threats properly
	hasReversibleLOS(targetTile){
		return this.hasProperty("ghostly") ||
		(
			this.tile.hasLOS(targetTile) &&
			// for fairness, make sure a line can be drawn in both directions
			spells.canDrawLine(this.tile, targetTile, /* skipEnds= */ true) && 
			spells.canDrawLine(targetTile, this.tile, /* skipEnds= */ true)
		);
	}


	inAttackRange(targetTile){
		return this.tile.distance(targetTile)<=this.calculateRange();
	}

	drawThreatTiles(){
		if(this.dead){
			return;
		}

		if(this.hasStatus(StatusStasis)){
			return;
		}
		
		this.tile.getRadiusTiles(this.calculateRange()).forEach(t=>{
			if(this.canAttack(t) && this.hasReversibleLOS(t)){
				console.log(t.xy(), "threat!")
				t.threat.sprite.visible = true;
			}
		});
	}

	drawIntentLine(target){
		if(this.dead || !this.tile){
			return;
		}

		if(!target){
			target = this.getTarget();
		}

		if(target && this.canAttack(target.tile)){	
			const graphics = new PIXI.Graphics();
			graphics.lineStyle({
				width: scale*2,
				color: 0xFFFF00,
				cap: "round"
			});


			let checkTile = target.tile;
			const blockingWall = this.getFirstWallBlockingAttack(target.tile);
			if(blockingWall){
				checkTile = blockingWall;
				console.log("stopTile",checkTile)
			}
	        const stopTile = checkTile;


			graphics.moveTo(this.getCenteredDrawX(), this.getCenteredDrawY());
			graphics.lineTo(stopTile.getCenteredDrawX(), stopTile.getCenteredDrawY());
			intentsContainer.addChild(graphics);

			this.intentLine = graphics;
		}
	}

	clearIntentLine(){
		if(this.intentLine){
			intentsContainer.removeChild(this.intentLine);
			delete this.intentLine;
		}
	}

	cleanupStatuses(){
		this.statuses.forEach(s=>{
			s.destroy();
		})
		this.statuses = [];
	}

	// TODO: probably should go in Status as a static method
	getStatusConstructor(statusName){
		return spellEffects.statusList['Status'+statusName];
	}

	addStatusByName(statusName, times){
		if(times == undefined) times = 1;

		let status;
		const statusConstructor = this.getStatusConstructor(statusName);
       	status = this.addStatus(statusConstructor, times);
        return status;
	}

	getStatusByName(statusName){
		const statusConstructor = this.getStatusConstructor(statusName);
		return this.getStatus(statusConstructor);
	}

	addStatus(statusType, stacks){
		if(stacks == undefined){
			stacks = 1;
		}
		let existingStatus = this.getStatus(statusType);
		if(existingStatus){
			existingStatus.level+=stacks;
			//refresh			
			existingStatus.ttl = existingStatus.duration;
		}else{
        	this.statuses.push(new statusType(this));
			existingStatus = this.getStatus(statusType)
			existingStatus.level = stacks;
        }
		if(existingStatus.name == "Burning"){
			this.maxBurnCheckAndSet(existingStatus.level)
		}

		if(existingStatus.name == "Bolstered"){
			this.heal(stacks);
		}

		return existingStatus;
	}

	maxBurnCheckAndSet(newStackAmount){
		return this.maxBurnStacks = Math.max(newStackAmount, this.maxBurnStacks);
	}

	hasStatus(statusType){
		return this.getStatus(statusType) &&  !this.getStatus(statusType).destroyed;
	}

	getStatus(statusType){
		return this.statuses.find(s => s.constructor == statusType);
	}

	removeStatus(statusType){
		for(let k=this.statuses.length-1;k>=0;k--){
			const status = this.statuses[k];

			if(status.constructor == statusType){
				status.destroy();
				this.statuses.splice(k,1);
				break;
			}
		}
		this.drawStatuses();
	}

	// todo: support both
	// removeStatus(status){
	// 	status.destroy;
	// 	this.statuses.splice(
	// 		this.statuses.indexOf(status),
	// 		1
	// 	);
	// }

	update(){
		for(let k=this.statuses.length-1;k>=0;k--){
			const status = this.statuses[k];

			if(status){
				if(status.monster){
					if(status.monster.dead){
						console.log("trying to status tick on dead monster");
					}else{
						status.statusTick();
					}
				}
			}else{
				game.consoleLog("UNDEFINED STATUS: "+this.getName()+" k:"+k + " length:"+this.statuses.length);
			}
		}

		if(this.hasProperty("summon")){
			const monsterType = map.getMonsterTypeByName(this.getProperty("summon"));
			const spawnedMonster = new Monster(monsterType);	
			map.monsters.push(spawnedMonster);
			spawnedMonster.teleportNearTile(this.tile);
		}

		if(this.hasProperty("gainsBerserk")){
			this.addStatusByName("Berserk", 1);
		}
	}

	decrementStatuses(){
		for(let k=this.statuses.length-1;k>=0;k--){
			const status = this.statuses[k];
			if(status){
				if(status.monster){
					if(status.ttl >0){
						status.ttl -= 1;
					}

					if(status.ttl == 0){
						status.destroy(/* expired= */ true);
						this.statuses.splice(k,1);
					}
				}
			}
		}
		this.drawStatuses();
	}

	drawUpdate(delta, elapsed){
		this.updateHealthBars();
		this.updateDrawPosition();

		if(this.dead){
			if(this.deadFlashCount >= 10){
				this.container.visible = false;
				this.okToCleanup = true;
			}else{
				this.sprite.tint = 0xFF0000;
				const visible = Math.cos(elapsed/2) > 0;
				if(this.container.visible != visible){
					this.deadFlashCount++;
				}
				this.container.visible = visible;
			}
		}else{
			if(this.hasStatus(StatusStasis)){
				this.sprite.tint = 0xbb44bb;
			}else{
				this.sprite.tint = 0xFFFFFF;
			}
		}
	}

	updateDrawPosition(){
		this.container.x = tileSize * this.x * scale;
		this.container.y = tileSize * this.y * scale;

		if(!this.dead){
			this.container.visible = this.x != 0;
		}
	}

	updateHealthBars(){
		this.healthBar.visible = false;
		return;
		if(this.healthBar){
			this.healthBar.visible = this.hp < this.getMaxHp();
			this.healthBar.width = Math.ceil((this.hp/this.getMaxHp()) * tileSize);
			this.healthBar.x = 0;
			this.healthBar.y = 21;
		}
	}

	// todo: unify this with drawable??
	cleanupSprite(){
		monsterContainer.removeChild(this.container);
	}

	destroy(){
		game.consoleLog("DESTROY: "+this.id + " , on tile:"+this.xy());
		this.tile.monster = null;
	}

	heal(amount, healType){
		if(this.dead){
			return;
		}

		if(this.hasStatus(StatusVigor)){
			let vigorStacks=this.getStatus(StatusVigor).level;
			//TODO: if we get some cards that add vigor stacks, switch to flat increase instead
			//amount+= vigorStacks*2;
			amount *= 2;
		}

		this.hp = Math.min(this.getMaxHp(), this.hp + amount);
		this.updateHealthBars();
	}
	// TODO: resistances
	// source is an object containing a source "tile"
	damage(amount, damageType, source){
		if(this.dead){
			return;
		}

		if(!source){
			throw("no damage source detected in monster.js damage(). please fix!");
		}

		if(source.type != "attack" && this.hasProperty("crystal")){
			// TODO: caption for "IMMUNE"
			return;
		}

		// SHIELD (take damage right off the top)
		if(source.tile && this.hasStatus(StatusShield)){
			const status = this.getStatus(StatusShield);
			if(this.tile.inDirection(source.tile, status.direction)){
				let blockValue = status.level;
				console.log(`status.level before: (${status.level})`)

				const damageBlocked = Math.min(blockValue, amount);
				status.level -= damageBlocked;
				console.log(`shield.level after: (${status.level})`)
				amount -= damageBlocked;

				console.log(`blocked (${damageBlocked}) damage`)

				if(this.hasStatus(StatusFireStance) && source.type == "attack"){
					let burnBackDamage = this.getStatus(StatusFireStance).level;
					if(source.tile.monster){
						source.tile.monster.damage(
							burnBackDamage,
							"FIRE",
							/* source= */ {tile:this.tile, type: "spell"}
						);
					}
					
				}

				// remove immediately if no more shield
				if(status.level <= 0){
					this.removeStatus(StatusShield);
					if(this.hasStatus(StatusFireStance)){
						this.removeStatus(StatusFireStance);
					}
				}

				if(amount == 0){
					this.drawStatuses();
					return;
				}
			}
		}else if(source && source.tile && this.hasStatus(StatusVengeful)){//Teleport time.
			this.teleportNearTile(source.tile);
		}

		if(damageType == "FIRE"){
			if(amount <= 2){
				main.playSound("damageFIRE-QUIET");
			}else{
				main.playSound("damageFIRE");
			}
		}else if(damageType == "ELEC"){
			main.playSound("damageELEC");
		}else if(damageType == "MOON"){
			main.playSound("damageMOON");
		}

		/* all forms of damage reduction/increase here */

		if(this.hasStatus(StatusIlluminated)
			// trying out extra damage from all types for now
			//&& source && source.type == "spell"
		){
			amount += this.getStatus(StatusIlluminated).level;
		}
		if(this.hasStatus(StatusEclipsed)){
			let eclipsedStacks=this.getStatus(StatusEclipsed).level;
			amount = Math.max(1,amount - eclipsedStacks);
			this.removeStatus(StatusEclipsed);
		}
		if(this.hasStatus(StatusStasis)){
			amount = Math.max(1,amount - map.getNumNonBossEnemies());
		}

		if(this.hasStatus(StatusFireImmunity)){
			if(damageType=="FIRE"){
				return;
			}
			
		}

		if(this.hasStatus(StatusTempered)){
			let temperedStacks = this.getStatus(StatusTempered).level
			amount = Math.max(1,amount-temperedStacks);
		}

		

		if(this.isPlayer){
			amount = Math.max(1, amount - gear.getDamageReductionBonus());
		}


		if(this.hasStatus(StatusShocked)){
			this.removeStatus(StatusShocked);
			game.addEvent(
                this.shockedEffect,
                [amount],
                150,
                this,
                /* priority= */ -1
            );
			
		}

		spells.totalDamage += amount;

		this.subtractHp(amount);
	}

	// handles damage and "pay hp"
	subtractHp(amount){
        if(this.hasStatus(StatusBolstered)){
        	const bolstered = this.getStatus(StatusBolstered);
            bolstered.level -= amount;
            if(bolstered.level <= 0){
                this.removeStatus(StatusBolstered);
            }
        }

        this.hp = Math.max(0, this.hp - amount);

		this.drawStatuses();
		this.checkForDeath();

		if(this.isPlayer){
			game.addScreenshake(4+4*Math.log(amount));
        	game.updateSidebarInfo();
		}
	}

	shockedEffect(amount){
		// ignore player
		let closestTarget = this.getNearestMonster([player]);
		if(closestTarget){
			let dist = util.tileDistance(closestTarget, this);
			if(dist <= 2.5){
                spells.drawEffectsBetween(this.tile, closestTarget.tile, "ELEC");
				game.addEffect("ELEC", closestTarget.tile);

				closestTarget.damage(amount, "ELEC", /* source= */ {tile:this.tile, type: "shocked"});
			}
		}

		game.updateUI();
	}

	sicEmRaiju(target){//target is a monster
		let raiju = map.getAllTilesWithMonsters("Raiju");

		for(let i =0; i<raiju.length; i++){
			if(target.ally || target.isPlayer){
				if(raiju[i].monster.ally){
					continue;
				}
			}else{//enemy targets
				if(!raiju[i].monster.ally){
					continue;
				}
			}

			game.consoleLog(raiju[i]);
			//TODO: when bump attacks deal more damage update this to reference Raiju's damage
			game.consoleLog("Raiju attacks "+ target.getName() +" for 10 damage");

			const raijuMonster = raiju[i].monster;
			const closestEmptyTile = map.getClosestEmptyTile(target.getTile());
			game.consoleLog("Raiju ("+raijuMonster.id+") has tried to move: " + closestEmptyTile?.xy());

			raiju[i].monster.move(closestEmptyTile);
			game.consoleLog("Raiju ("+raijuMonster.id+") has moved to     : " + raijuMonster.tile?.xy());

			//game.consoleLog(raijuMonster.tile);
			game.consoleLog("Raiju's ("+raijuMonster.id+") tile.monster: " + raijuMonster.tile?.monster?.xy());

			target.damage(10,"ELEC",/* source= */ {tile:this.tile});
			//for a bit of spice have raiju shock itself afterwords
			raijuMonster.addStatus(StatusShocked);

			
			
		}
	}

	calculateAttack(){
		let bonusDamage=0;
		if(this.hasStatus(StatusBerserk)){
			bonusDamage=this.getStatus(StatusBerserk).level;
		}
		if(this.isPlayer){
			bonusDamage += gear.getBumpDamageBonus();
		}
		return this.damageValue+bonusDamage;
	}

	checkForAndDamageWalls(targetTile){
		const blockingWall = this.getFirstWallBlockingAttack(targetTile);
        if(blockingWall){
            blockingWall.damage();
            return true;
        }
        return false;
	}

	// returns the first wall blocking an attack or undefined if none are there
	getFirstWallBlockingAttack(targetTile){
		let walls = [];
        const a = this.tile;
        const b = targetTile;

        const wallCheck = (x,y)=>{
            const tile = map.getTile(x,y);
            console.log("wall check", x, y)
			if(tile.type == "wall"){
            	walls.push(tile);
            }
            return true;
        };

		util.bresenhams(a, b, wallCheck);
		util.bresenhams(b, a, wallCheck);

		console.log("walls length", walls.length);

		walls.sort((a,b)=>a.distance(this.tile) - b.distance(this.tile));

		return walls[0];
	}

	attack(target){
		const targetTile = target.tile;

		// this code checks if a wall is blocking
		if(this.checkForAndDamageWalls(targetTile)){
			return;
		}


		const attackDamage = this.calculateAttack();
		target.damage(attackDamage, "PHYSICAL", /* source= */ {tile:this.tile, type: "attack"});

		if(target.isPlayer){
			main.playSound("playerHit");
		}else{
			main.playSound("monsterHit");
		}

		if(this.onHitStatus){
			target.addStatusByName(this.onHitStatus);
		}
		this.postAttack(target, targetTile);

		game.addEffect("PHYSICAL", targetTile);
	}

	postAttack(target, targetTile){
		if(this.monsterType.berserker){
			// todo: fix this?? it seems too generically named for its specific effect
			// proably should just do what we have above with something like "onHitSelfStatus"
			this.addStatus(StatusBerserk);
		}

		if(target.isPlayer && this.hasProperty("burn")){
			const card = cards.createCard("Burn");
			card.delayedDiscardAnimation(this);
		}

		if(this.hasProperty("destroyWalls")){
			const walls = targetTile.getAllNeighbors().filter(t=>!t.passable)
			walls.splice(0, this.getProperty("destroyWalls")).forEach(wall=>{
				wall.destroyWall();
			});
		}

		return;
	}

	checkForDeath(){
		if(this.hp <= 0){
			this.die();
		}
	}

	die(){
		const oldTile = this.tile;

		if(!this.dead){
			if(this.tile && this.tile.item){
				this.tile.item.show();
			}

			//drop a glass key
			if(this.tile && this.hasStatus(StatusBoss)){
				const neighbors = util.shuffle(
					this.tile.getAllNeighbors()
						.filter(t=>!t.monster && t.passable)
						.concat(this.tile)
						.filter(t=>!t.item)
				).sort((a,b)=>{
					return a.distance(this.tile) - b.distance(this.tile)
				});

				const neighborsWithNoMana = neighbors.filter(t=>!t.mana);
				let itemSpawnTile;
				// try to place in the closest tile without mana
				// if that doesn't work out, we'll place on the mana regardless
				if(neighborsWithNoMana.length){
					itemSpawnTile = neighborsWithNoMana[0];
				}else if(neighbors.length){
					itemSpawnTile = neighbors[0];
				}

				if(itemSpawnTile){
					itemSpawnTile.createItem(ItemPotion);
				}
			}
			
			this.dead = true;

			// reassign blood scent
			if(this.hasStatus(StatusScent)){
				spellEffects.bloodScent({caster: player});
			}

			this.checkForOnDeathAbilityPreStatusRemoval()

			this.cleanupStatuses();
			this.clearIntentLine();
			this.destroy();

			this.checkForOnDeathAbilityPostStatusRemoval(oldTile);

			cards.returnMinions(this);

			
		}
	}

	checkForOnDeathAbilityPreStatusRemoval(oldTile){
		if(this.hasStatus(StatusSlowDeath)){
			cards.createCardInHand("Curse of Weight", /* addToCollection= */ true);
		}
	}

	checkForOnDeathAbilityPostStatusRemoval(oldTile){
		if(this.hasProperty("spawnMonsterOnDeath")){
			oldTile.createMonster(this.getProperty("spawnMonsterOnDeath"));
		}

		if(this.hasProperty("explodeOnDeath")){
			let tilesInBlastRadius = oldTile.getRadiusTiles(2);
			let monstersInBlastRadius = tilesInBlastRadius.filter(t=> t.monster).map(t=>t.monster);
			let explosionDamage = this.getProperty("explodeOnDeath");
			monstersInBlastRadius.forEach(m=> {
				m.damage(explosionDamage, "FIRE", oldTile);
			});
			tilesInBlastRadius.forEach(t=>{
				game.addEffect("FIRE",t);
			});
		}

		if(this.hasProperty("manaOnDeath")){

			//TODO: Decide Should the type of mana equal the starting color for the player?  Should it be random?
			let params = {
				targetTile: oldTile,
				amount: 3,
				cost: 0,
				totalManaConsumed: 0,
				spellType: cards.starterType,
				caster: this,
				originTile: oldTile,
				monstersAffected: [],
				manaOnDeath: true,
				//direction: direction,
				// spellProcessor handles one effect at a time
				//allEffects: effects.length == 1 ? spell?.effects : effects,
				//spell: spell
			};

			spellEffects.generateRandomMana(params, /*mustTargetMonster = */false);
		}
	}

	getName(){
		return this.monsterType.name;
	}

	getDescription(){
		return this.monsterType.description;
	}

	getContainer(){
		if(!this.container){
			this.container = new PIXI.Container();
		}
		return this.container;
	}

	updateScale(){
		this.container.scale = new PIXI.Point(scale, scale);
	}

	getTile(dx, dy){
		if(!dx) dx = 0;
		if(!dy) dy = 0;
		return map.getTile(this.x+dx, this.y+dy);
	}

	moveCloseTo(tile){
		const closest = map.getClosestEmptyTile(tile);
		this.move(closest);
	}

	move(newTile){
		if(this.tile){
			this.tile.monster = null;
			if(this.tile.item){
				this.tile.item.show();
			}
		}
		this.tile = newTile;
		this.tile.monster = this;

		// hide the item under the monster for clarity
		if(this.tile.item){
			this.tile.item.hide();
		}

		this.x = this.tile.x;
		this.y = this.tile.y;

		this.tile.stepOn(this); 

		this.updateDrawPosition();

		if(this.isPlayer && !(this.x == 0 && this.y == 0)){
			game.drawIntents();
		}
	}

	swap(other){
		const thisTile = this.tile;
		const otherTile = other.tile;
		
		this.tile = null;
		other.tile = null;

		this.move(otherTile);
		other.move(thisTile);
	}

	tryMove(dx, dy){
		// TODO: just get rid of free move
		game.freeMove = true;

		const previousLevelIndex = game.levelIndex;
		if(cards.state != "TARGET" && !game.animationEffects.length && game.freeMove){
			const newTile = this.getTile(dx, dy);
			if(newTile.passable){
				if(newTile.monster){
					if(newTile.monster.ally){
						this.swap(newTile.monster);
					}else{
						this.attack(newTile.monster);
					}
				}else{
					this.move(newTile);
				}

				if(game.levelIndex == previousLevelIndex){
					game.freeMove = false;
				}
				game.updateUI();

				main.playSound("footstep");
			}
		}
	}
	//ignoredMonsters is an array of monsters
	getNearestMonster(ignoredMonsters){
		//returns closest enemy
		return map.livingMonsters().concat(player).filter(m=> !ignoredMonsters.concat(this).includes(m) ).sort((a,b)=>{
			const aDist = this.tile.distance(a.tile);
			const bDist = this.tile.distance(b.tile);

			return aDist - bDist;
		})[0];
	}

	// TODO: it should get the closest distance by pathfinding distance, not as the crow flies
	// a monster that has a wall between this one might only be 2 spaces away but take far longer to pursue
	getTarget(){
		if(this.hasStatus(StatusStasis)){
			return;
		}

		let enemies = this.getEnemies();
		
		//if targets by blood scent, prioritize that.
		if(this.monsterType.hunter){
			enemies = enemies.filter(m=>m.hasStatus(StatusScent));			
		}

		return this.getNearestTarget(enemies);
		
	}

	getNearestTarget(targets){
		return targets.sort((a,b)=>{
			const aDist = this.tile.distance(a.tile);
			const bDist = this.tile.distance(b.tile);

			//tie break by distance to player
			if(aDist == bDist){
				const aPlayerDist = player.tile.distance(a.tile);
				const bPlayerDist = player.tile.distance(b.tile);
				return aPlayerDist - bPlayerDist;
			}
			
			return aDist - bDist;
		})[0];
	}

	getFurthestTarget(targets){
		return targets.sort((a,b)=>{
			const aDist = this.tile.distance(a.tile);
			const bDist = this.tile.distance(b.tile);

			//tie break by distance to player
			if(aDist == bDist){
				const aPlayerDist = player.tile.distance(a.tile);
				const bPlayerDist = player.tile.distance(b.tile);
				return bPlayerDist - aPlayerDist;
			}
			
			return bDist - aDist;
		})[0];
	}

	getEnemies(){
		if(this.ally || this.isPlayer){
			return map.livingMonsters().filter(m=>!m.ally);
		}else{
			return map.livingMonsters().filter(m=>m.ally).concat(player);
		}
	}

	/*
		returns a map of actions performed. the number is how many times the action happened.

		{
			move: 1,
			attack: 1
		}

		accepts the same format for allowedActions (number is how many times the action is allowed).
	*/
	performActions(allowedActions, turnEnders){
		if(!allowedActions){
			allowedActions = {
				move: this.monsterType.moveSpeed || 1,
				attack: this.monsterType.attackSpeed || 1
			};
		}

		if(!turnEnders){
			turnEnders = this.monsterType.turnEnders || {move: true, attack: true};
		}

		const actionsPerformed = {
			move: 0,
			attack: 0
		}; 


		if(this.hasProperty("static")){
			return actionsPerformed;
		}

		game.consoleLog("perform action "+this.getName())

		/* TODO: a much better way to do monster AI is to have an interface for actions

			each action implements a canDo and do method

			or if that's too complicated at least two methods on monster?

			benefits:
				-allowedActions and actionsPerformed are handled automatically
				-easy to reorder action priority
				-different monsters could easily have a different set of actions
		*/

		// TODO: remove cross pollination with spell processor
			
			// SPECIAL (TODO: probably should break each action type into separate function)
			// let special = this.monsterType.special;
			// if(special && this.isOffCooldown() && allowedActions.special){
			// 	game.consoleLog("has special "+this.getName());
			// 	game.consoleLog(special);
			// 	const specialSpell = main.spellMap[special];
				
			// 	let specialTarget = target;
			// 	if(specialSpell.range===0){
			// 		specialTarget = this;
			// 	}
			// 	let targets = spells.getTargets(this, specialSpell, specialTarget.getTile());
			// 	targets = targets.filter(o=>o.monster);
			// 	if(this.ally){
			// 		targets = targets.filter(o=>!o.monster.isPlayer && !o.monster.ally);
			// 	}

			// 	if(targets.length && this.tile.distance(specialTarget.tile)<=specialSpell.range){
			// 		game.consoleLog(this.monsterType.name + " is using special on " + specialTarget.monsterType.name);			

			// 		for(let z=0;z<targets.length;z++){
			// 			//game.consoleLog("specialTarget = " + specialTarget[i]);
			// 			game.consoleLog("z = " + z);
			// 			spells.effectsProcessor({
			// 				caster: this,
			// 				targets: targets[z],
			// 				effects: specialSpell.effects,
			// 				spellType: specialSpell.type,
			// 				spell: specialSpell
			// 			});
			// 		}
			// 		this.currentCD = this.cooldown+1;

			// 		actionsPerformed.special = true;
			// 	}
			// }


		while(true){
			let target = this.getTarget();
			if(!target){
				break;
			}

			// ATTACK
			if(actionsPerformed.attack < allowedActions.attack && 
			this.canAttack(target.tile)){
				this.attack(target);
				actionsPerformed.attack++;

				if(turnEnders.attack){
					allowedActions.move = 0;
				}

				continue;
			}

			if(actionsPerformed.move < allowedActions.move){
				if(this.pathfind(target.tile)){
					actionsPerformed.move++;

					if(turnEnders.move){
						allowedActions.attack = 0;
					}

					continue;
				}
			}

			// did nothing, so we're done
			break;
		}

		// TODO: this currently doesn't count down if there are no targets, which seems wrong
		//this.currentCD--;

		return actionsPerformed;
	}

	calculateRange(){
		return this.range;
	}

	isOffCooldown(){
		if(this.cooldown===undefined){
			return true;
		}else{
			if(this.currentCD <= 0){
				return true;
			}else{
				return false;
			}
		}
	}

	// returns true if successfully moved
	pathfind(targetTile){
		const path = this.getPath(targetTile);

		if(!path){
			return false;
		}

		// TODO: fix this hacky hunter path code
		if(this.monsterType.hunter && path[2] && this.canMove(path[2])){
			this.move(path[2]);
		}else if(path[1] && this.canMove(path[1])){
			this.move(path[1]);
		}else{
			const sortedTiles = this.tile.getAdjacentNeighbors()
				.filter(t=>this.canMove(t) && this.wantsToMove(t))
				.sort((a,b)=>{
					const aPlayerDist = player.tile.distance(a);
					const bPlayerDist = player.tile.distance(b);
					return aPlayerDist - bPlayerDist;
				});
			if(sortedTiles.length){
				this.move(sortedTiles[0]);
			}else{
				return false;
			}
		}

		return true;
	}

	getPathLength(targetTile){
		const path = this.getPath(targetTile);
		if(!path){
			return Infinity;
		}else{
			return path.length;
		}
	}

	getPath(targetTile){
		let ignoreMonsters = false;

		let passableCallback = (x, y) => {
			
		    const tile = map.getTile(x,y);

		    if(tile == targetTile || tile == this.tile){
		    	return true;
		    }
			let ignoreMonstersLocal = ignoreMonsters || (this.monsterType.hunter && (this.tile.distance(tile) == 1) );
		    if(!this.wantsToMove(tile)){
		    	return false;
		    }

		    return this.canMove(tile, ignoreMonstersLocal);
		}


		for(let i=1;i<=3;i++){
			if(i>=2){
				ignoreMonsters = true;
			}
			const path = [];
			let astar = new ROT.Path.AStar(targetTile.x, targetTile.y, passableCallback,{topology: 4});
			astar.compute(this.tile.x, this.tile.y, (x, y) => {
			   path.push(map.getTile(x,y));
			});

			if(this.monsterType.hunter && path[2] && this.canMove(path[2])){
				return path;
			}
			
			if(path[1] && this.canMove(path[1])){
				return path;
			}
		}
	}

	xy(){
		return `${this.x},${this.y}`;
	}

	canMove(tile, ignoreMonsters){
		if(this.ally){
			//allies don't want to crush mana
			if(tile.mana){
				return false;
			}
		}

		return (!tile.monster || ignoreMonsters) &&
			(tile.passable || this.hasProperty("ghostly"));
	}

	//regardless of if I can move here, do I really want to if it's possible to avoid it
	wantsToMove(tile){
		//for now, always true (since allies can never step on mana for now)

		if(this.isPlayer){
			// don't accidentally leave level if exit is unlocked but items remain
			if(map.getAllItems().length && (tile.stairs && tile != player.tile) && !tile.locked){
				return false;
			}
		}else if(this.monsterType.totem){
			//totems do not move
			return false;
		}

		return true;
	}
}

class Player extends Monster{
	constructor(){
		super(main.monsterTypeMap["Leyliner"], true);
		this.isPlayer = true;
	}

	drawThreatTiles(){}

	die(){
		super.die();
		game.gameOver();
	}

	getMaxHp(){
		let maxHp = this.maxHp;

		maxHp += gear.getHealthBonus();

		if(this.hasStatus(StatusBolstered)){
            maxHp += this.getStatus(StatusBolstered).level;
        }

		return maxHp;
	}
}

class MonsterType{
	constructor(name, description, sprite){
		this.name = name;
		this.description = description;
		this.sprite = sprite;
	}
}