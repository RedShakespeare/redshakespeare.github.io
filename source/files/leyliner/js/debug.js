debug = {
	showDebugMenu: function(){
		menu.showMenuList({
			type: 'DEBUG',
			title: 'Debug Menu',
			closeAfterSelection: true,
			listItems: [
				{
					title: 'Reposition',
					handler: ()=>{
						cards.state = "POSITION";
						menu.closeMenu();
					}	
				},
				{
					title: 'Zero Spell Costs',
					handler: ()=>{
						main.spellList.forEach(s=>s.cost=0);
						menu.closeMenu();
					}	
				},
				{
					title: 'Acquire Card',
					handler: debug.acquireCardMenu
				},
				{
					title: 'Add Status',
					handler: debug.addStatusMenu
				},
				{
					title: 'Kill All Monsters',
					handler: debug.killAllMonsters
				},
				{
					title: 'Set All Monsters to 1HP',
					handler: debug.setAllMonstersTo1Hp
				},
				{
					title: 'God mode',
					handler: debug.godMode
				},
				{
					title: 'Summon Enemy',
					handler: debug.summonEnemy
				},
				{
					title: 'Summon Ally',
					handler: debug.summonAlly
				},
				{
					title: 'Post Level Screen',
					handler: game.postLevelScreen
				},
				{
					title: 'Next Level',
					handler: ()=>{
						cards.cardsToAnimateToDiscard = cards.cardsToAnimateToDiscard.concat(cards.hand);
						cards.combineCards();
						game.newLevel();
					}
				},
				{
					title: 'Jump to Level',
					handler: debug.jumpToLevel
				},
				{
					title: 'Tick (skip to next turn)',
					handler: ()=>{
						game.tick();
						cards.startTurn();
					}
				},
				{
					title: 'Kill All Enemies',
					handler: debug.killAllEnemies
				},
				{
					title: 'Restart',
					handler: ()=>{
						game.init(game.seed);
						menu.closeMenu();
					}
				},
				{
					title: 'Keys & Gear',
					handler: debug.keysAndGear
				},
				{
					title: 'Set Player to 1 HP',
					handler: ()=>{
						player.hp = 1;
					}
				},
				{
					title: 'Win',
					handler: game.win
				},
				{
					title: 'Wake Up Boss',
					handler: debug.wakeUpBoss
				},
				{
					title: 'Mana Flood',
					handler: ()=>{
						map.getAllTiles().forEach(t=>{
							if(cards.canPlaceMana(t)){
								t.createMana();
							}
						});
					}
				},
				{
					title: 'Add burning 999 to all monsters',
					handler: ()=>{
						map.monsters.forEach(m=>m.addStatusByName("Burning", 999));
					}
				},
				{
					title: 'Chroma cards',
					handler: ()=>{
						cards.createCardInHand("Chroma Engine");
						cards.createCardInHand("Chroma Engine");
						cards.createCardInHand("Chroma Beam");
						cards.createCardInHand("Chroma Beam");
						cards.createCardInHand("Chroma Field");
						cards.createCardInHand("Chroma Field");
						cards.createCardInHand("Chroma Burst");
						cards.createCardInHand("Chroma Burst");
					}
				},
				{
					title: 'Destroy all walls',
					handler: ()=>{
						map.getAllTiles().forEach(t=>{
							if(t.type == "wall" && map.generationInBounds(t.x, t.y, 1)){
								t.replace(Floor);
							}
						});
					}
				},
				{
					title: 'Kill All Non-boss Monsters',
					handler: debug.killAllNonBossMonsters
				},
			]
		});
	},
	godMode: function(){
		player.maxHp = 9999;
		player.hp = player.maxHp;
		player.cleanupStatuses();
		for(let i=0;i<1000;i++){
			new ItemPotion(0,0).stepOn(player);
		}
	},
	acquireCardMenu: function(){
		menu.showMenuList({
			type: 'ACQUIRE_CARD',
			title: 'Acquire Card',
			listItems: main.spellList.map(s=>{
				//this is actually kind of dumb, maybe there should be one handler
				return {
					title: s.name,
					handler: ()=>{
						cards.createCardInHand(s.name, true);
						menu.closeMenu();
					}
				};
			})
		});
	},
	addStatusMenu: function(){
		menu.showMenuList({
			type: 'ADD_STATUS',
			title: 'Add Status',
			listItems: Object.values(spellEffects.statusList).map(s=>{
				return {
					title: s.name,
					handler: (tile)=>{
						let monster;
						if(tile && tile.monster){
							monster = tile.monster;
						}else{
							monster = player;
						}
						let currentLevel = monster.getStatus(s)?.level || 0;
						let status = monster.addStatus(s);
						if(status.canStack){
							status.level = currentLevel + 1;
						}
						game.updateUI();
						menu.closeMenu();
					}
				};
			}),
			selectTileOnItemSelection: true,
			selectingDescription: "Select a monster to add a status."
		});
	},
	killAllMonsters: function(){
		map.getAllTiles().forEach(t=>{
			if(t.monster && !t.monster.isPlayer){
				t.monster.die();
			}
		});
	},
	killAllNonBossMonsters: function(){
		map.getAllTiles().forEach(t=>{
			if(t.monster && !t.monster.isPlayer && !t.monster.hasStatus(StatusBoss)){
				t.monster.die();
			}
		});
	},
	killAllEnemies: function(){
		map.getAllTiles().forEach(t=>{
			if(t.monster && !t.monster.isPlayer && !t.monster.ally){
				t.monster.die();
			}
		});
		setTimeout(()=>{
			//game.talisman = 1;
			//cards.openShop();
		},100);
	},
	setAllMonstersTo1Hp: function(){
		map.getAllTiles().forEach(t=>{
			if(t.monster && !t.monster.isPlayer){
				t.monster.hp = 1;
			}
		});
	},
	wakeUpBoss: function(){
		map.getAllTiles().forEach(t=>{
			if(t.monster && t.monster.hasStatus(StatusStasis)){
				t.monster.getStatus(StatusStasis).ttl = 1;
				t.monster.update();
			}
		});
	},
	summonEnemy: function(monsterType){
		let monsters = main.monsterTypes.map(m=>m.name);
		monsters.sort();
		menu.showMenuList({
			type: 'SUMMON_ENEMY',
			title: 'Summon Enemy',
			listItems: monsters.map(m=>{
				return {
					title: m,
					handler: (tile)=>{
						const monster = new Monster(main.monsterTypeMap[m]);
						monster.moveCloseTo(tile);
						map.monsters.push(monster);
						menu.closeMenu();
					}
				};
			})
		});
	},
	summonAlly: function(monsterType){
		let monsters = main.monsterTypes.map(m=>m.name);
		monsters.sort();
		menu.showMenuList({
			type: 'SUMMON_ALLY',
			title: 'Summon Ally',
			listItems: monsters.map(m=>{
				return {
					title: m,
					handler: (tile)=>{
						const monster = new Monster(main.monsterTypeMap[m]);
						monster.moveCloseTo(tile);
						map.monsters.push(monster);

						monster.ally = true;
						monster.addStatus(StatusAlly);

						menu.closeMenu();
					}
				};
			})
		});
	},
	keysAndGear: function(){
		player.keys = 100;
		map.getAllTiles().forEach(t=>t.item = new ItemChest(t.x, t.y));
	},
	jumpToLevel: function(){
		cards.cardsToAnimateToDiscard = cards.cardsToAnimateToDiscard.concat(cards.hand);
		cards.combineCards();
		menu.showMenuList({
			type: 'JUMP_TO_LEVEL',
			title: 'Jump to Level',
			listItems: [...Array(10).keys()].map(i=>i+1).map(level=>{
				return {
					title: level,
					handler: ()=>{
						game.levelIndex = level - 2;
						game.newLevel();
						menu.closeMenu();
					}
				};
			})
		});
	},
	printSpells: function(type){
		main.spellList
			.filter(s=>s.type == type && s.prod)
			.sort((a,b)=>a.cost-b.cost)
			.forEach((s,index)=>console.log(
				`#${index+1} - ${s.cost} - ${s.name} - ${s.description} ${cards.isStarter(s) ? `[STARTER]`:``}`
			));
	},
	printSpellsWithHandler: function(checkHandler){
		main.spellList
			.filter(s=>s.prod && checkHandler(s))
			.sort((a,b)=>a.cost-b.cost)
			.sort((a,b)=>a.type.localeCompare(b.type))
			.forEach(s=>console.log(
				`${s.type} - ${s.cost} - ${s.name} - ${s.description} ${cards.isStarter(s) ? `[STARTER]`:``}`
			));
	},
	// effects is array of string effect names
	printSpellsWithEffects: function(effects){
		debug.printSpellsWithHandler(s=>effects.find(e=>spells.spellHasEffect(s,e)));
	},
	printShieldSpells: function(){
		debug.printSpellsWithHandler(s=>s.description.indexOf("SHIELD")>-1);
	},
	printStarterCards: function(){
		debug.printSpellsWithHandler(s=>cards.isStarter(s));
	},
	printMonsters: function(){
		let level = 1;
		let levelCount = 0;
		const monsters = Object.values(main.monsterTypeMap).sort((a,b)=>{
			return a.level - b.level;
		});

		let countText = '';
		let monsterText = '';

		monsters.forEach(m=>{
			if(m.level > level && level <= 20){
				countText += `${" ".repeat(8)}Level ${level} monsters: ${levelCount}` + "\n";
				monsterText += "\n";

				level = m.level;
				levelCount = 1;
			}else{
				levelCount++;
			}
			const hp = Math.ceil(m.hp*game.monsterHpScale);

			const range = m.range || 1;

			const rangeValue = 5 - 5 * 0.75 ** (range);

			const value = Math.round(
				hp + (m.damage || 0) * rangeValue
			);

			monsterText +=
				`[LEVEL ${util.leftPad(m.level,3)}] - ` +
				util.leftPad(m.damage || 0,2)+`🗡️ `+
				util.leftPad(range > 1 ? range : '',2)+`🏹 `+
				util.leftPad(hp,3)+`❤️ - ` + 
				util.leftPad(value, 3) + `💰 ` +
				m.name.toUpperCase() + ` - ` +
				m.description +
				"\n";
		});

		console.log(countText);
		console.log(monsterText);
	},
	printMapMonsters: function(){
		map.monsters.forEach(m=>console.log(m.getName()));
	},
	showErrorHighlight: function(){
		if(game.debug){
			document.querySelector("#error-higlight").style.display = "block";
		}
	}
}