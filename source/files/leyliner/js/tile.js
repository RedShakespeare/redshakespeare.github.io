class Tile extends Drawable{
	constructor(spriteLocation, x, y, passable){
		super(spriteLocation, x, y);
		this.passable = passable;

		if(map.inBounds(x,y)){
			this.highlight = new Drawable(48, x,y);
			this.threat = new Drawable(119, x,y, threatContainer);
			this.threat.sprite.visible = false;

			this.highlighted = false;
			this.highlightSpriteLocation = 0;

			this.highlightStates = {};
			
			this.updateHighlight();
		}
	}

	createMonster(monsterName){
        const monster = new Monster(main.monsterTypeMap[monsterName]);
        monster.move(this);
        map.monsters.push(monster);
        return monster;
	}

	moonManaEffect(){
		this.getAllNeighbors().forEach(t=>{
    		if(t.monster){
				if(!t.monster.ally && !t.monster.isPlayer){
					t.monster.addStatus(StatusIlluminated);
					t.monster.drawStatuses();
				}
			}
		});
	}

	bloodManaEffect(){	
    	this.getAllNeighbors().forEach(t=>{
    		if(t.monster){
				if(t.monster.ally){
					t.monster.heal(2, "BLOOD");
					t.monster.drawStatuses();
				}
			}
		});
	}

	createMana(spellType){
		if(this.mana){
			//fuck
			debugger;
		}
		if(!spellType) spellType = cards.starterType;
		const manaClass = colors[spellType].manaClass;
        const mana = new manaClass(this.x, this.y);

        if(this.item){
       		this.item.hide();
       	}

       	// mana effects
        if(spellType == "MOON"){
        	this.moonManaEffect();
		}
		if(spellType == "BLOOD"){
        	this.bloodManaEffect();
		}
	}

	removeMana(){
		if(this.mana){
			this.mana.destroy();

	        if(this.item){
	       		this.item.show();
	       	}
	    }
	}

	createItem(itemClass){
		//we wouldn't usually want to allow item replacement, but it may be unavoidable sometimes
		if(this.item){
        	this.item.removeFromTile();
		}
		new itemClass(this.x, this.y);
	}

	//can always safely walk through/past
	walkable(){
		return this.passable;
	}

	//currently does not handle items, mana, etc.
	replace(newTileType){
		const newTile = new newTileType(this.x, this.y);
		if(this.monster){
			newTile.monster = this.monster;
			this.monster.tile = newTile;
		}
		this.cleanupSprite();
		map.tiles[this.x][this.y] = newTile;

		// replacing tiles can mess up fov
		map.getAllTiles().forEach(t=>t.clearFov());

		return newTile;
	}

	xy(){
		return `${this.x},${this.y}`;
	}

	stepOn(monster){
		if(this.mana){
			this.mana.stepOn(monster);
		}
		if(this.item && monster.isPlayer){
			//was considering fixing this for chests, but also we're removing chests?
			main.playSound("item");
			this.item.stepOn(monster);
		}
		game.updateSidebarInfo();
	}

	getRadiusTiles = function(radius){
		const tiles = [];
		for(let i=this.x-radius;i<=this.x+radius;i++){
			for(var j=this.y-radius;j<=this.y+radius;j++){
				const tile = map.getTile(i,j);
				if(this.distance(tile) < (radius + spells.radiusSmoothingMargin)
				&& map.inBounds(i,j)){
					tiles.push(tile);
				}
			}
		}
		return tiles;
	}

	getAngle(targetTile){
		return Math.atan2(targetTile.y - this.y, targetTile.x - this.x);
	}

	//returns a numeric direction 0 to 3
	getDirection = function(targetTile){
		let direction = Math.round(
			(this.getAngle(targetTile)) / (Math.PI / 2) 
		);
		if(direction < 0){
			direction += 4;
		}
		return Math.abs(direction);
	}

	/* 	
		considers if a target tile is in a given direction from this tile
		e.g. for direction 0, true means the target tile is indeed "east" of this tile
			1=south,2=west,3=north

		tiles on a 45 degree angle will return true for 2 directions
	*/ 
	inDirection(targetTile, direction){
		const snappedDirectionAngle = direction * Math.PI/2;
		const angle = this.getAngle(targetTile);
		let angleDiff = Math.abs(angle - snappedDirectionAngle);
		while(angleDiff > Math.PI){
			angleDiff = Math.abs(angleDiff - Math.PI * 2);
		}
		return angleDiff <= Math.PI / 4;
	}

	getDirectionalTiles(targetTile){
		const direction = this.getDirection(targetTile);
		return map.getAllTiles().filter(t=>{
			if(t == this){
				return false;
			}

			return this.inDirection(t, direction);
		});
	}


    getNeighbor(dx, dy){
        return map.getTile(this.x + dx, this.y + dy)
    }

	getAdjacentNeighbors(){
        return util.shuffle([
            this.getNeighbor(0, -1),
            this.getNeighbor(0, 1),
            this.getNeighbor(-1, 0),
            this.getNeighbor(1, 0)
        ]);
    }

    getAllNeighbors(){
        return util.shuffle([
            this.getNeighbor(0, -1),
            this.getNeighbor(0, 1),
            this.getNeighbor(-1, 0),
            this.getNeighbor(1, 0),
            this.getNeighbor(-1, -1),
            this.getNeighbor(1, -1),
            this.getNeighbor(1, 1),
            this.getNeighbor(-1, 1)
        ]);
    }

	//ignoredMonsters is an array of monsters
	getNearestMonster(ignoredTiles){
		//returns closest enemy
		return map.livingMonsters().concat(player).filter(m=> !ignoredTiles.concat(this).includes(m.tile) ).sort((a,b)=>{
			const aDist = this.distance(a.tile);
			const bDist = this.distance(b.tile);

			return aDist - bDist;
		})[0];
	}

	//mostly untested code -- could be useful later?
	getRandomNearbyMonsterTile(radius){
		console.log("inside getRandomNearbyMonsterTile");
		let aoeTiles = this.getRadiusTiles(radius);
		console.log (aoeTiles);
		let nearbyMonsters = aoeTiles.filter(m=>m.monster);
		console.log(nearbyMonsters);
		let randomIndex = Math.random(0,nearbyMonsters.length);
		console.log(randomIndex);
		console.log(nearbyMonsters[randomIndex]);
		return nearbyMonsters[randomIndex];
	}

	//Gets highest HP monster tile in a radius.  Tiebreaks to closest to origin tile.
	getHealthiestMonsterTile(radius){
		let aoeTiles = this.getRadiusTiles(radius);
		let nearbyMonsters = aoeTiles.filter(m=>m.monster);
		console.log(nearbyMonsters);
		if(nearbyMonsters.length==0){
			return;
		}
		if(nearbyMonsters.length>1){
			nearbyMonsters.sort((a,b)=>{
				return a.hp -b.hp;
			});
			console.log(nearbyMonsters);

			//TODO break tie of more than two.
			if(nearbyMonsters[0].monster.hp == nearbyMonsters[1].monster.hp){
				let d0 = this.distance(nearbyMonsters[0]);
				let d1 = this.distance(nearbyMonsters[1]);
				if(d0 < d1){
					return nearbyMonsters[0];
				}else{
					return nearbyMonsters[1];
				}
			}
		}else{
			//array is length 1
			return nearbyMonsters[0];
		}
		
		
	}


	getConnectedTiles(filterCallback){
        let connectedTiles = [this].filter(filterCallback);
        let frontier = connectedTiles.concat();
        while(frontier.length){
            let neighbors = frontier.pop()
                                .getAdjacentNeighbors()
                                .filter(filterCallback)
                                .filter(t => !connectedTiles.includes(t));
            connectedTiles = connectedTiles.concat(neighbors);
            frontier = frontier.concat(neighbors);
        }
        return connectedTiles;
    }


	distance(otherTile){
		if(!otherTile){
			return Infinity;
		}
		return util.tileDistance(this, otherTile);
	}

	cleanupSprite(){
		super.cleanupSprite();
		if(this.highlight){
			this.highlight.cleanupSprite();
		}
		if(this.threat){
			this.threat.cleanupSprite();
		}
	}

	setHighlight(type){
		this.highlightStates[type] = true;
		this.updateHighlight();
	}

	unsetHighlight(types){
		types.forEach(t=>{
			this.highlightStates[t] = false;
		});
		this.updateHighlight();
	}

	clearHighlight(type){
		this.highlightStates = {};
		this.updateHighlight();
	}

	updateHighlight(){
		this.highlighted = true;
		const previousHighlightSprite = this.highlightSprite;
		if(this.highlightStates.ERROR){
			this.highlightSprite = 105; 
		}else if(this.highlightStates.THREAT){
			this.highlightSprite = 105; 
		}else if(this.highlightStates.CURSOR){
			this.highlightSprite = 103; 
		}else if(this.highlightStates.EFFECT){
			this.highlightSprite = 104; 
		}else if(this.highlightStates.RANGE){
			this.highlightSprite = 102; 
		}else{
			this.highlighted = false;
		}

		this.highlight.sprite.visible = this.highlighted;

		//change texture if necessary
		if(this.highlighted && previousHighlightSprite != this.highlightSprite){
			this.highlight.sprite.texture = draw.getTexture(this.highlightSprite);
		}
	}

	getContainer(){
		return tileContainer;
	}

	clearFov(){
		delete this._fovMap;
	}

	hasLOS(target){
		if(this == target){
			return true;
		}

		// TODO: is this buggy with tile replacement (wall=>floor)?
		if(!this._fovMap){
			if(target._fovMap){
				//we can rely on either side having FOV
				return target.hasLOS(this);
			}
			this.computeFOV();
		}
		
		const key = target.x+','+target.y;
		if(this._fovMap[key]){
			return true;
		}else{
			return false;
		}
	}

	computeFOV(){
		this._fovMap = {};

		const lightPasses = (x, y) => map.getTile(x,y).passable;
		const fov = new ROT.FOV.PreciseShadowcasting(lightPasses);
		fov.compute(
			this.x,
			this.y,
			40,
			(x, y, r, visibility) => {
				if(map.inBounds(this.x,this.y)){
					const key = x+','+y;
					this._fovMap[key] = true;
				}
			}
		);
	}
}

class Wall extends Tile{
	constructor(x,y){
		const spriteLocation = 114 + util.randomRange(0,3);
		super(spriteLocation, x, y, false);
		this.hp = 2;
		this.updateTint();
		this.type = "wall";
		this.markForCrumbling = false;
	}

	updateTint(){
		if(this.sprite){
			this.sprite.tint = game.getWallTint();
		}
	}

	handleCrumbling(){
		if(this.markForCrumbling){
			this.markForCrumbling = false;
			this.hp--;
			// try just destroying wall immediately
			this.destroyWall();
			// if(this.hp == 1){
			// 	this.updateSprite(this.spriteLocations[0]+16);
			// 	this.updateTint();
			// }else if(this.hp <= 0){
			// 	this.destroyWall();
			// }
		}
	}

	damage(){
		this.markForCrumbling = true;
	}

	destroyWall(){
		this.replace(Floor).updateSprite(48);
	}
}

class Floor extends Tile{
	constructor(x,y){
		let spriteLocation = ((x+y)%2)*16+2;
		super(spriteLocation, x, y, true);
		this.type = "floor";
	}
}

class Stairs extends Tile{
	constructor(x,y){
		super(128, x, y, true);
		this.preventStuff = true;
		this.locked = true;
		this.name = "Stairs";
		this.stairs = true;
		this.type = "stairs";
		this.description = "A locked staircase. It will unlock when all non-boss monsters are vanquished."
	}

	//can always safely walk through/past
	walkable(){
		return false;
	}

	stepOn(monster){
		super.stepOn(monster);
		if(monster.isPlayer && !this.locked){
			//game.newLevel();

			game.postLevelScreen();
		}
	}

	unlock(){
		if(this.locked){
			this.locked = false;
			this.changeTexture(129);

			this.description = "A staircase.";
			main.playSound("doorOpen");
		}
	}
}