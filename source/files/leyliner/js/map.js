map = {
	tiles: [],
	monsters: [],
	// typically, you want to use this when accessing monsters
	// "dead" monsters are only kept around temporarily so we don't disturb the loop if we ever iterate it
	// and so we can animate them
	livingMonsters: ()=>map.monsters.filter(m=>!m.dead),
	generate: function(){
		util.tryTo('generate map', function(){
			tileContainer.removeChildren();
			game.cleanUpDrawables();

			game.consoleLog("generate map attempt")

	        const noDisconnectedIslands = map.generateTiles() ==
	        	map.randomPassableTile().getConnectedTiles(t=>t.walkable()).length;

	        const exitNotBlocked = map.stairs.getAdjacentNeighbors().filter(t=>t.passable).length > 0;

	        return noDisconnectedIslands && exitNotBlocked;

	    });


		map.generateMonsters();
		map.generateItems();
	},
	generateItems: function(){
		const items = [
			ItemTalisman,
			ItemTalisman
		];

		if(util.random()<.7){
			//binned until later patches (currently identical to health gear and too powerful)
			//items.push(ItemHeart);
		}

		if(game.levelIndex > 0){
			items.push(ItemPotion);
		}
		items.push(ItemPotion);

		if(util.random()<.5 && game.levelIndex > 0){
			items.push(ItemBrokenHourglass);
		}

		//increase chance per level
		if(util.random() < (game.levelIndex / 10)){
			items.push(ItemTalisman);
		}

		// 3, 6, 9
		if(game.levelIndex % 3 == 2){
			items.push(ItemHourglass);
		}
		
		if(game.levelIndex == 0){
			//items.push(ItemHourglass);
		}


		// only 1 key on first 3 levels
		items.push(ItemGlassKey);
		items.push(ItemChest);
		if(game.levelIndex > 2){
			items.push(ItemGlassKey);
			items.push(ItemChest);
		}

		items.forEach(itemClass=>{
			map.randomPassableTile().createItem(itemClass);
		});
	},
	// returns the number of walkable tiles (floor, not stairs or walls)
	// this is so that when checking for disconnected islands, a stair is not counted
	// (an open stair blocks movement sort of )
	generateTiles: function(){
		map.cleanup();

		let fillPercent = util.random()*.25+.05;
		const r = util.random();
		if(r<.25){
			fillPercent = 0.05;
		}else if(r<.4){
			fillPercent = 0.3;
		}

		fillPercent = .32;

	    let walkableTiles=0;
	    map.tiles = [];

	    const margin = Math.max(1, 3 - game.levelIndex);

		for(i=0;i<mapSize;i++){
			map.tiles[i] = [];
			for(j=0;j<mapSize;j++){
				if(util.random()<fillPercent || !map.generationInBounds(i,j, 1)){
					map.tiles[i][j] = new Wall(i,j);
					if(!map.generationInBounds(i,j, 0)){
						map.tiles[i][j].hide();
					}
				}else{
					const floorSpriteLocation = ((i+j)%2)*16+2;
					map.tiles[i][j] = new Floor(i,j);
					walkableTiles++;
				}
			}
		}

	    map.stairs = map.randomPassableTile().replace(Stairs);
	    walkableTiles--;

	    return walkableTiles;
	},
	cleanup: function(){
		map.getAllTiles().forEach(t=>{
			t.cleanupSprite();
			if(t.mana){
				t.mana.cleanupSprite();
			}
			if(t.item){
				t.item.cleanupSprite();
			}

			map.livingMonsters().forEach(m=>m.cleanupSprite());

			map.monsters = [];
		});
	},
	getAllTilesWithMonsters: function(specificMonsterName){
		if(specificMonsterName){
			// game.consoleLog("specific name = " + specificMonsterName);
			// game.consoleLog(map.getAllTiles().filter(t=>t.monster && t.monster.getName()==specificMonsterName));
			return map.getAllTiles().filter(t=>t.monster && t.monster.getName()==specificMonsterName);
		}
		return map.getAllTiles().filter(t=>t.monster);
	},
	getAllTilesWithMana: function(){
		return map.getAllTiles().filter(t=>t.mana);
	},
	getAllTiles: function(){
		const tiles = [];
		if(map.tiles[0]){
			for(i=0;i<mapSize;i++){
				for(j=0;j<mapSize;j++){
					tiles.push(map.tiles[i][j]);
				}
			}
		}
		return tiles;
	},
	getClosestEmptyTile:function(target){//target is a tile
		return map.getAllTiles()
                        .filter(y=>y.passable && !y.monster && !y.mana && !y.item)
                        .sort((a,b)=>{
                            return target.distance(a)-target.distance(b);
                        })[0];
	},
	pickAndCreateMonster: function(floorStrength){
		const monsterType = map.pickMonsterType(floorStrength);

		let numMonsters = 1;
		if(monsterType.properties && monsterType.properties.swarm){
			numMonsters = monsterType.properties.swarm;
		}
		let firstMonster;
		for(let i=0;i<numMonsters;i++){
			const monster = new Monster(monsterType);	
			map.monsters.push(monster);

			if(i==0){
				firstMonster = monster;
			}else{
				monster.teleportNearTile(firstMonster.tile);
			}

		}
		return firstMonster;
	},
	getBaseNumMonsters: function(index){
		let floorNum = index+1;
		switch(floorNum){
			case 1:
				return 3;
			case 2:
			case 3:
				return 4;
			case 4:
			case 5:
			case 6:
				return 5;
			case 7:
			case 8:
				return 6;
			case 9:
			case 10:
				return 7;
		}

		return 0;
	},
	generateMonsters: function(){
		map.monsters = [];

		let numMonsters = map.getBaseNumMonsters(game.levelIndex);

		const maxFloorStrength = 10;
		const floorStrength = Math.min(maxFloorStrength, game.levelIndex + 1);
		console.log("numMonsters", numMonsters)
		for(let i=0;i<numMonsters;i++){
			map.pickAndCreateMonster(floorStrength);
		}

		//windshield mobs
		for(let i=0;i<floorStrength-2;i++){
			map.pickAndCreateMonster(util.randomRange(1,floorStrength-2));
		}

		if(map.livingMonsters()){
			const boss = new Monster(map.getMonsterTypeByName("Guardian"));	

			boss.maxHp = Math.round(10 * (1.5 ** game.levelIndex));
			boss.hp = boss.maxHp;
			boss.damageValue = 5 * (game.levelIndex + 1);
			boss.range = game.levelIndex + 1;

			map.monsters.push(boss);
			boss.addStatus(StatusStasis);
			boss.addStatus(StatusBoss);
			boss.sprite.animationSpeed = 0;
			boss.sprite.tint = 0xff0000;
		}
	},
	pickMonsterType: function(monsterLevel){
		return util.pickRandom(main.monsterTypes.filter(monsterType=>{
			return monsterType.level==monsterLevel &&
				// don't create 4 of the same monster
				map.monsters.filter(m=>monsterType.name==m.getName()).length < 4;
		}));
	},
	getMonsterTypeByName: function(monsterName){
		return main.monsterTypes.find(m=>m.name==monsterName);
	},
	randomPassableTile: function(){
	    let tile;
	    util.tryTo('get random passable tile', function(){
	        let x = util.randomRange(0,mapSize-1);
	        let y = util.randomRange(0,mapSize-1);
	        tile = map.getTile(x, y);
	        return tile.passable && !tile.monster && !tile.mana && !tile.item && !tile.preventStuff;
	    });
	    return tile;
	},
	inBounds: function(x, y, borderSize){
		if(!borderSize) borderSize = 0;
	    return x>=borderSize && y>=borderSize && x<=mapSize-1-borderSize && y<=mapSize-1-borderSize;
	},
	// a special inBounds specifically for generating the map, so that 
	generationInBounds: function(x,y, borderSize){
		let xMin = borderSize;
		let xMax = mapSize-1-borderSize;
		let yMin = borderSize;
		let yMax = mapSize-1-borderSize;
		// 1,9,1,9

		if(game.levelIndex == 0){
			xMin++;
			xMax -= 2;
			yMin++;
			yMax -= 2;
		}else if(game.levelIndex == 1){
			xMin++;
			xMax--;;
			yMin++;
			yMax -= 2;
		}else if(game.levelIndex == 2){
			xMin++;
			xMax--;
			yMin++;
			yMax--;
		}else if(game.levelIndex == 3){
			xMax--;
			yMin++;
			yMax--;
		}else if(game.levelIndex == 4){
			xMax--;
			yMax--;
		}else if(game.levelIndex == 5){
			yMax--;
		}

		return x>=xMin && x<=xMax && y>=yMin && y<=yMax;
	},
	getTile: function(i, j){
		if(!map.inBounds(i,j)){
			if(!map.dummyWall){
				map.dummyWall = new Wall(-1000,-1000);
			}
			return map.dummyWall;
		}else{
			return map.tiles[i][j];
		}
	},
	setDebugTile: function(){
		if(!debug.tileIndex){
			debug.tileIndex = 1;
		}else{
			debug.tileIndex++;
		}
		const key = `tile${debug.tileIndex}`;
		window[key] = map.selectedTile;
		let monsterInfo = '';
		if(map.selectedTile.monster){
			monsterInfo = `(contains ${map.selectedTile.monster.getName()})`;
		}
		console.log(`setting "${key}" to tile ${map.selectedTile.xy()} ${monsterInfo}`);
	},
	//returns true if it was updated
	selectTile: function(tileX, tileY, skipIntents){
		const previouslySelectedTile = map.selectedTile;
		if(game.state == "running"){
			map.clearSelectTile();
	    	if(map.inBounds(tileX,tileY)){
	    		map.selector.x = tileX;
	    		map.selector.y = tileY;
	    		map.selector.updateDrawPosition();

	    		map.selectedTile = map.getTile(tileX, tileY);

	    		let highlightType = "CURSOR";
	    		if(cards.state == "TARGET"){
	    			if(!spells.isValidTarget()){
	    				highlightType = "ERROR";
	    			}
	    		}else if(cards.state=="POSITION"){
	    			if(!player.canMove(map.selectedTile)){
	    				highlightType = "ERROR";
	    			}
	    		}

	    		map.selectedTile.setHighlight(highlightType);

   				main.updateHoverDescription();

   				if(!skipIntents){
   					game.drawIntents(map.selectedTile.monster, /* fromSelectTile=*/ true);
   				}
	    	}
	    }

	    return previouslySelectedTile != map.selectedTile;
    },
    clearSelectTile: function(){
    	if(map.selectedTile){
    		map.selectedTile.unsetHighlight(["CURSOR","ERROR"]);
    		map.selectedTile = null;
    		if(cards.state == "PROCESSING"){
    			debugger;
    		}

    		document.querySelector("#sidebar-hover-info").innerHTML = "";
    	}
    },
    getNumNonBossEnemies: function(){
    	return map.monsters.filter(m=>!m.ally && !m.hasStatus(StatusStasis)).length;
    },
    getAllItems: function(){
    	return map.getAllTiles().map(t=>t.item).filter(item=>item);
    }
}