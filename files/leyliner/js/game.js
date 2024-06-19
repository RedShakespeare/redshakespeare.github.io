game = {
	version: "1.5",
	state: "loading",
	monsterHpScale: 1.8,
	monsterCounter: 0,
	bonusLevelDraw: 0,
	gameDrawNum: 3,
	defaultDrawNum: 3,
	quakeTurns: 10,
	talisman: 0,
	screenshake: 0,
	//true to get log messages
	debug: false,
	drawables: [],
	potions: [],
	cleanUpDrawables: function(){
		// this is just a failsafe in case sprites don't get cleaned up normally
		game.drawables.forEach(d=>d.cleanupSprite());
		game.drawables = [];
	},
	logMessages: [],
	//game events that can be processed sequentially (e.g. spell effects)
	eventQueue: [],
	// use higher priority (lower number) to order important events
	addEvent: function(handler, args, delay, scope, priority){
		// prevent animations and delayed events when, for instance, dying
		if(game.state != "running"){
			return;
		}

		if(delay == undefined) delay = 250;

		if(priority == undefined){
			priority = 1;
		}

		const eventObject = {
			handler,
			args,
			delay,
			scope,
			priority
		};

		game.eventQueue.push(eventObject);

		// sort by priority
		game.eventQueue.sort((a,b)=>a.priority - b.priority);
	},
	processEvents: function(delta){
		if(game.state != "running"){
			game.eventQueue = [];
		}else{
			if(game.eventQueue.length){
				const e = game.eventQueue[0];
				e.delay -= delta * 16.7;

				if(e.delay <= 0){
					game.eventQueue.shift();
					try{
						e.handler.apply(e.scope, e.args);
					}catch(e){
						debug.showErrorHighlight();
						console.error('failure during processEvents handler: ',e);
					}
				}
			}else{
				game.handleEmptyEventQueue();
			}
		}
	},
	//if nothing else is being processed, we should handle state transitions
	//e.g. all spell effects are done, we want to do some post-spell work
	handleEmptyEventQueue: function(){
		if(cards.state == "PROCESSING"){
			spells.spellProcessor();
		}else{
			game.delayedAutoPickup();
		}
	},
	consoleLog: function(arguments){
		if(game.debug){
			console.log(arguments);
		}
		game.logMessages.push(arguments);
	},
	openDiscord: function(){
		window.open('https://discord.gg/FBnq4Y5NYY', '_blank').focus();
	},
	tick: function(){
		game.tickQueued = false;
		main.updateHoverDescription();

		game.consoleLog("TICK");

		let monstersAndPlayer=map.livingMonsters().concat(player);

		for(let k=monstersAndPlayer.length-1;k>=0;k--){
			const monster = monstersAndPlayer[k];
			if(!monster.dead){
				game.consoleLog("status Tick Update");
				monster.update();
			}
		}

		game.updateUI();

		let delayAfterAllies = 0;
		let delayAfterEnemies = 0;
		// only include delays if they are needed to sequence actions visually
		// if there are no enemies, none of this matters really
		if(game.getEnemies().length){
			delayAfterAllies = 250;
			delayAfterEnemies = 150;
		}

		game.alliesAct();

		game.addEvent(game.enemiesAct,[], delayAfterAllies);

		game.addEvent(game.tickSecondPhase,[], delayAfterEnemies);

		// DECREMENT STATUSES
		// this is intentionally handled separately from status tick
		// so that shield, for instance, expires after monsters act

		// oh but this might be causing some weird display issues
		// we might want to only include shield here and do everything else earlier
		game.addEvent(()=>{
			for(let k=monstersAndPlayer.length-1;k>=0;k--){
				const monster = monstersAndPlayer[k];
				if(!monster.dead){
					game.consoleLog("decrement statuses");
					monster.decrementStatuses();
				}
			}
		},[], 100);

		game.turnCount++;

		game.delayedAutoPickup();
	},

	quake: function(){
		map.getAllTiles().forEach(t=>{
			const item = t.item;
			if(item && item.fragile){
				item.removeFromTile();
				if(item.fragileSpawn){
					t.createItem(item.fragileSpawn);
				}
			}

			if(t.monster){
				if(t.monster.hasStatus(StatusStasis)){
					t.monster.removeStatus(StatusStasis);
				}

				if(t.monster.hasProperty("crystal")){
					t.monster.die();
				}
			}
		});
		game.addScreenshake(20);
		main.playSound("glassBreak");
	},

	levelFinished: function(){
		return !map.livingMonsters().find(m=>!m.dead && !m.ally);
	},

	delayedAutoPickup: function(){
		if(game.levelFinished() && !menu.isMenuOpen()){
			game.addEvent(game.autoPickup,[], 500);
		}
	},

	autoPickup: function(){
		if(game.levelFinished() && !menu.isMenuOpen()){
			cards.hide = true;

			map.getAllTiles().forEach(t=>{
				if(t.mana){
					t.mana.destroy();
				}
			});

			map.monsters.filter(m=>m.ally).forEach(m=>m.die());

			if(game.talisman){
				if(cards.state != "SELECT"){
					cards.changeState("SELECT");
				}
				cards.openShop();
				return;
			}
			
			let itemTiles = map.getAllItems()
								.map(item=>item.tile)
								.sort((a,b)=>player.getPathLength(a)-player.getPathLength(b));

			if(!player.keys){
				itemTiles = itemTiles.filter(itemTile=> itemTile.item.name != "Treasure Chest");
			}

			if(itemTiles.length){
				player.pathfind(itemTiles[0]);
			}else{
				player.pathfind(map.stairs);
			}

			// update statuses
			player.update();
			player.decrementStatuses();
			if(player.dead){
				return;
			}

			game.addEvent(game.autoPickup,[], 50);
		}
	},

	getAllies: function(){
		return map.livingMonsters().filter(m=>m.ally);
	},

	getEnemies: function(){
		return map.livingMonsters().filter(m=>!m.ally);
	},



	alliesAct: function(){
		//allies go first!
		game.unitsAct(game.getAllies(), /* reverseSort= */ true);
	},

	enemiesAct: function(){
		//enemies go second!
		game.unitsAct(game.getEnemies(), /* reverseSort= */ false);

		// crumble walls once per turn rather than per attack (this is easier to understand for the player)
		map.getAllTiles().filter(t=>t.type == "wall").forEach(t=>{
			t.handleCrumbling();
		});
	},

	// generic act functin that supports both ally and enemies
	unitsAct: function(units, reverseSort){
		// reverse it because we go in reverse order in loop
		let sortedUnits = units.sort((a,b)=>{
			return b.tile.distance(player.tile) - a.tile.distance(player.tile);
		});
		if(reverseSort){
			sortedUnits = sortedUnits.reverse();
		}
		sortedUnits.forEach(s=>console.log("distance to player",  s.tile.distance(player.tile)));
		for(let k=sortedUnits.length-1;k>=0;k--){
			const monster = sortedUnits[k];
			const numActions = monster.hasStatus(StatusBoss) ? 2 : 1;
			for(let z=0;z<numActions;z++){
				if(!monster.dead){
					monster.performActions();
				}
			}
		}
	},

	tickSecondPhase: function(){
		game.updateUI();

		game.drawIntents();
	},
	doEndTurnCardEffects: function(){
		console.log("doEndTurnCardEffects", cards.hand.length)
		cards.hand.forEach(c=>{
			if(c.spell.endTurnEffects){
				c.spell.endTurnEffects.forEach(effect=>{
					console.log("processing end turn effects for: "+c.spell.name)
					spells.effectsProcessor({
	    				caster:player,
	    				targets: [player.tile],
	    				effects: [effect],
	    				spellType: c.spell.type,
	    				totalManaConsumed: 0,
	    				cost: c.spell.cost,
	    				originTile: player.tile,
	    				spell: c.spell
    				});
				});

				c.shake = 200;
			}
		});
	},
	doManaEffects: function(){
		game.attractElectricMana();

		game.moonManaEffect();

		game.bloodManaEffect();

		game.updateUI();

	},
	removeDeadMonsters: function(){
		for(let k=map.monsters.length-1;k>=0;k--){
			const monster = map.monsters[k];
			if(monster.dead && monster.okToCleanup){
				monster.cleanupSprite();
				map.monsters.splice(k,1);
			}
		}

		if(!map.livingMonsters().find(m=>!m.dead && !m.ally && !m.hasStatus(StatusBoss))){
			map.stairs.unlock();
		}
	},

	wallTints: [
		0x779c3f,
		0x9c3f6f,
		0xbec57a,
		0x29627a,
		0xa4a4a4,
		0x584467,
		0x357650,
		0x3e370f,
		0x60003c,
		0x242424

	],

	getWallTint: function(){
		return this.wallTints[game.levelIndex];
	},

	addScreenshake: function(amount){
		game.screenshake = Math.max(game.screenshake, amount);
		util.animate(game, "screenshake", 0);
	},

	bloodManaEffect(){
		// moved to placement effect
		return;

		const healedAllies = new Set();
		map.getAllTiles().filter(t=>t.mana && t.mana.type == "BLOOD")
			.sort((a,b)=>{
				const aPlayerDist = player.tile.distance(a);
				const bPlayerDist = player.tile.distance(b);
				return aPlayerDist - bPlayerDist;
			})
			.forEach(manaTile=>{
				const neighbors = manaTile.getAllNeighbors().filter(t=>t.monster);
				for(let i=0; i<neighbors.length;i++){
					if(neighbors[i].monster?.ally){
						healedAllies.add(neighbors[i].monster);
					}
				}
			});

		healedAllies.forEach(m=>{
			const healAmount = 2;
			m.heal(healAmount, "BLOOD");
		});
	},

	moonManaEffect: function(){
		// moved to placement effect
		return;

		const eclipsedMonsters = new Set();
		const illuminatedMonsters = new Set();
		map.getAllTiles().filter(t=>t.mana && t.mana.type == "MOON")
		.forEach(manaTile=>{
			const neighbors = manaTile.getAllNeighbors().filter(t=>t.monster);
			for(let i=0; i<neighbors.length;i++){
				if(neighbors[i].monster.ally || neighbors[i].monster.isPlayer){
					eclipsedMonsters.add(neighbors[i].monster);
				}else{
					illuminatedMonsters.add(neighbors[i].monster)
				}
			}
		});
		eclipsedMonsters.forEach(e=>{
			e.addStatus(StatusEclipsed);
		});
		illuminatedMonsters.forEach(i=>{
			i.addStatus(StatusIlluminated);
		});
	},

	attractElectricMana: function(){
		map.getAllTiles().filter(t=>t.mana && t.mana.type == "ELEC" && t.distance(player.tile)>=2)
			.sort((a,b)=>{
				const aPlayerDist = player.tile.distance(a);
				const bPlayerDist = player.tile.distance(b);
				return aPlayerDist - bPlayerDist;
			})
			.forEach(manaTile=>{
				const closestNeighbor = manaTile.getAllNeighbors().filter(t=>!t.mana && !t.monster && t.passable && !t.item)
					.filter(t=>t.distance(player.tile) < manaTile.distance(player.tile))
					.sort((a,b)=>{
						const aPlayerDist = player.tile.distance(a);
						const bPlayerDist = player.tile.distance(b);
						return aPlayerDist - bPlayerDist;
					})[0];

				if(closestNeighbor){
					manaTile.mana.move(closestNeighbor);
				}
			});
	},
	animationEffects: [],
	addEffect: function(type, tile){
		if(game.state != "running"){
			return;
		}

		const sprite = colors[type].manaSprite + 32;
		game.animationEffects.push(
			new Effect(sprite, tile.x, tile.y)
		);
	},
	queueTick: function(){
		game.tickQueued = true;
		game.freeMove = false;
	},
	endTurn: function(){
		if(cards.state == "SELECT"){
			game.doEndTurnCardEffects();
			game.doManaEffects();
			cards.changeState("MONSTERS");
			game.addEvent(game.queueTick,[], 300);
		}else if(cards.state == "MANA"){
			cards.basicManas = [];
			cards.startSelectingMana();
		}
	},
	turnCount: 0,
	selectPosition: function(tile){
		if(tile==undefined) tile = map.randomPassableTile();

		cards.changeState("SELECT");
		player.move(tile);
		main.playSound("deal");
		map.selector.resetTexture();

		if(cards.class == "EXPERT"){
			spellEffects.generateContinuousMana({
				targetTile: player.tile,
				amount: game.levelIndex+1
			});
		}

		game.updateUI();
	},
	getQuakeTurns: function(){
		return 7 + game.levelIndex;
	},
	displayTurnCount: function(){
		const turnsLeft = game.getQuakeTurns() - game.turnCount;
		document.querySelector("#turncount-turn").innerHTML = `Turn ${game.turnCount}`;
		if(turnsLeft > 0){
			document.querySelector("#turncount-quake").innerHTML =
				`${util.pluralize('turn', turnsLeft)} left until quake...`;
		}else{

			document.querySelector("#turncount-quake").innerHTML = "";
		}
		util.fadeInOut("#turncount", 700);
	},
	startManaPhase: function(){

		// for animating discarded cards
		cards.cardsToAnimateToDiscard = cards.cardsToAnimateToDiscard.concat(cards.hand);

		// EPHEMERAL
		cards.hand.forEach(c=>{
			if(c.spell.ephemeral){
				c.exhaust();
			}
		});
		cards.hand = cards.hand.filter(c=>!c.spell.ephemeral);
		
		cards.changeState("MANA");
		cards.cardsToDiscard = cards.hand;
		cards.basicManas = cards.hand.map(c=>c.spell.type).filter(t=>colors[t]);
		cards.sortBasicManas();
		cards.startSelectingMana();
	},
	numEnemiesRemaining: function(){
		return map.monsters.filter(m=>!m.ally && !m.dead).length;
		if(enemiesRemaining == 0){
			game.freeMove = true;
		}
	},
	updateUI: function(){
		game.removeDeadMonsters();

		if(game.numEnemiesRemaining() == 0){
			game.freeMove = true;
		}

		cards.updateHandManaCosts();

		//update shortcuts
		for(let i=0;i<cards.hand.length;i++){
			const card = cards.hand[i];
			card.root.querySelector(".shortcut").innerHTML = (cards.hand.length-i);
		};

		document.querySelector("#attune-button .button-inner").innerHTML = `Attune (${game.talisman})`;

		if(cards.state == "SELECT"){
			document.querySelector("#end-turn-button").classList.remove("disabled");
			if(game.talisman>0){
				document.querySelector("#attune-button").classList.remove("disabled");
			}else{
				document.querySelector("#attune-button").classList.add("disabled");
			}
			if(cards.hide){
				document.querySelector("#hide-show-button .button-inner").innerHTML = "Show cards";
			}else{
				document.querySelector("#hide-show-button .button-inner").innerHTML = "Hide cards";
			}
			document.querySelector("#hide-show-button").classList.remove("disabled");
			//document.querySelector("#view-cards-button").classList.remove("disabled");
		}else{
			document.querySelector("#end-turn-button").classList.add("disabled");
			document.querySelector("#attune-button").classList.add("disabled");
			document.querySelector("#hide-show-button").classList.add("disabled");
			//document.querySelector("#view-cards-button").classList.add("disabled");
		}

		document.querySelector("#view-cards-button").classList.remove("disabled");

		map.monsters.concat(player).forEach(m=>m.drawStatuses());

		game.updateSidebarInfo();

		cards.hand.forEach(c=>c.updateDescription());

		game.updatePotions();
	},
	usePotion: function(index){
		if(!menu.isMenuOpen() && cards.state == "SELECT"){
			const potion = game.potions[index];
			potion.use();
			game.potions.splice(index,1);
			game.updateUI();
		}
	},
	updatePotions: function(){
		const list = document.querySelector("#sidebar-potions");
		let html = "";
		const seenPotions = new Set();
		const drawPotions = [];
		game.potions.forEach((potion,index)=>{
			if(!seenPotions.has(potion.potionType)){
				drawPotions.push({index,potion});
				seenPotions.add(potion.potionType);
			}
		});
		drawPotions.sort((a,b)=>a.potion.getName().localeCompare(b.potion.getName()));
		drawPotions.forEach(potionInfo => {
			const potion = potionInfo.potion;
			const index = potionInfo.index;
			const count = game.potions.filter(p=>p.potionType == potion.potionType).length;
			html += `<div class="potion" 
					id="potion-${index}"
					onclick="game.usePotion(${index})"
					onmouseout="tooltips.hideAllTooltips()"
					onmouseover="tooltips.showPotionTooltip(${index})"
				>
					<div class="potion-inner"
						style="background-position: ${2*potion.potionType*-24}px ${2*14*-24}px;"
					></div>`;
			if(count > 1){
				html += `<div class="potion-count">${count}</div>`;
			}
			html += `</div>`;
		});
		list.innerHTML = html;
	},
	showIntents: false,
	drawIntentsMonsterArg: null,
	drawIntentsfromSelectTileArg: null,
	drawIntents: function(monster, fromSelectTile){
		if(cards.state == "TARGET"){
			return;
		}

		if(game.drawIntentsMonsterArg == monster && 
		game.drawIntentsfromSelectTileArg == fromSelectTile){
			//don't redraw if unnecessary!
			return;
		}
		game.drawIntentsMonsterArg = monster;
		game.drawIntentsfromSelectTileArg = fromSelectTile;

		let monsters = map.monsters.filter(m=>!m.ally);

		if(monster && monster != player){
			monsters = [monster];
		}


		map.getAllTiles().forEach(t=>t.threat.sprite.visible=false);
		monsters.forEach(m=>{
			m.drawThreatTiles();
		});

		if(cards.state != "POSITION"){
			intentsContainer.removeChildren();
			monsters.forEach(m=>{
				m.drawIntentLine();
			});

			if(monster || !fromSelectTile){
				intentsContainer.alpha = 1;
			}
		}

		game.toggleIntents(!!monster);
	},
	toggleIntents: function(value){
		game.showIntents = value;
		threatContainer.visible = value;
	},
	updateSidebarInfo: function(){
		if(!player){
			return;
		}

		let sidebarMainInfo = ``;
		sidebarMainInfo += `<div>
			Floor: ${game.levelIndex + 1} 
		</div>`;
		sidebarMainInfo += `<div>HP: <span id="player-hp"
				style="color:${(player.hp < 0.5 * player.getMaxHp()) ? "red" : "#00dd00"};"
			>${player.hp}/${player.getMaxHp()}</span>
			&nbsp;&nbsp;&nbsp;
			KEYS: ${player.keys}
			&nbsp;&nbsp;&nbsp;
			DRAW: ${cards.getTotalNumToDraw()}
			&nbsp;&nbsp;&nbsp;
			TURN: ${game.turnCount} (${Math.max(0, game.getQuakeTurns() - game.turnCount)} to quake)
		</div>`;

		sidebarMainInfo += `<div>Shield: <span id="player-shield">
			${player.hasStatus(StatusShield) ? player.getStatus(StatusShield).level : 0}
		</span></div>`;



		sidebarMainInfo += `<div>Spell Power: +${gear.getSpellDamageBonus()}</div>`;
		sidebarMainInfo += `<div>Attack Damage: +${gear.getBumpDamageBonus()}</div>`;
		sidebarMainInfo += `<div>Damage Reduction: +${gear.getDamageReductionBonus()}</div>`;
		sidebarMainInfo += `<div>Health: +${gear.getHealthBonus()}</div>`;
		document.querySelector("#sidebar-main-info").innerHTML = sidebarMainInfo;
	},
	freeMove: false,
	levelIndex: 0,
	init: function(seed){
		player = new Player();

		map.selectedTile = null;
		map.generated = false;

		game.cleanUpDrawables();

		if(seed){
			game.seed = seed;
		}else{
			game.seed = util.randomString(14);
		}
		//uncomment to force same seed every game:
		//game.seed = "HMNDWQGBHDAXOY";
		util.setSeed(game.seed);

		game.levelIndex = -1;

		game.bonusLevelDraw = 0;
		game.gameDrawNum = game.defaultDrawNum;

		game.potions = [];

		cards.cleanup();

		gear.init();

		
		cards.init();

		game.newLevel();

		game.talisman = 0;

		game.updateUI();

		gear.init();

		game.state = "running";
	},
	postLevelScreen: function(){
		if(game.levelIndex == 9){
			game.win();
		}else{


			if(player.hasStatus(StatusBolstered)){
				player.subtractHp(player.getStatus(StatusBolstered).level);
				if(player.dead){
					return;
				}
			}

			cards.cardsToAnimateToDiscard = cards.cardsToAnimateToDiscard.concat(cards.hand);
			cards.combineCards();

			const items = [{
				title: `Heal 20 (current HP: ${player.hp}/${player.getMaxHp()})`,
				handler: ()=>{
					player.heal(20);
					menu.closeMenu(true);
					game.newLevel();
				}
			}];
			items.push({
				title: 'Add a Move card',
				handler: ()=>{
					cards.createCardInDeck(
						`Move [${cards.starterType}]`,
						/* addToCollection= */ true
					);
					menu.closeMenu(true);
					game.newLevel();
				}	
			});
			if(cards.getAllOwned().length > 1){
				items.push({
					title: 'Remove a card',
					handler: ()=>{
						cards.removeCardScreen();
					}	
				});
			}
			menu.showMenuList({
				type: 'POST_LEVEL',
				title: 'Level defeated!',
				locked: true,
				listItems: items,
				replaceable: false
			});
		}

	},

	newLevel: function(){
		intentsContainer.removeChildren();
		map.selectedTile = null;
		game.state = "newLevelGeneration";

		game.levelIndex++;
		game.turnCount = 1;

		game.bonusLevelDraw = 0;

		main.playSound("music" + ((game.levelIndex % 3) +1 ));


		map.generate();
		map.generated = true;

		const oldPlayer = player;

		player = new Player();
		player.hp = oldPlayer.hp;
		player.maxHp = oldPlayer.maxHp;
		// TODO: decide if this is a stupid place to put keys... probably
		player.keys = oldPlayer.keys;

		spells.overcharge=0;

		// reset temp card states
		cards.collection.forEach(c=>c.discount = 0);

		if(game.levelIndex==0){
			player.keys = 0;
			player.maxHp = 20;
			player.hp = player.getMaxHp();
			player.sprite.visible = true;
			player.dead = false;
		}
		player.tile = null;
		player.move(map.getTile(0,0));

		player.cleanupStatuses();
		player.maxBurnStacks = 0;

		cards.startLevel();

		cards.hide = false;
		game.updateUI();

		if(game.levelIndex == 10){
			game.win();
		}

		game.state = "running";
	},
	showOverlay: function(selector){
		game.hideAllOverlays();

		document.querySelector("#black-overlay").style.display = "block";

		const overlay = document.querySelector(selector);
		overlay.style.opacity = 1;
		//TODO: fix this if you can get util.animation fixed
		//util.animate(overlay.style, "opacity", 1, {decay:.99});

		overlay.style.display = "block";

	},
	hideAllOverlays(){
		document.querySelectorAll(".overlay").forEach(o=>o.style.display="none");
	},
	selectDeck: function(deck, event){
		game.state = "deckSelection";
		cards.selectedStarterDeck = deck;
		game.hideAllOverlays();
		main.playSound("mana");

		if(event){
			event.stopPropagation();
		}

		menu.showMenuList({
			type: 'CLASS-SELECTION',
			title: 'Select a class',
			closeAfterSelection: true,
			locked: true,
			listItems: [
				{
					title: `EXPERT: Start a level with ${cards.selectedStarterDeck} mana, scaling per level.`,
					handler: ()=>{
						game.chooseClass("EXPERT");
					}	
				},
				{
					title: `TACTICIAN: When you play a ${cards.selectedStarterDeck} card,
					a non-${cards.selectedStarterDeck} card in hand becomes 1 cheaper until played.`,
					handler: ()=>{
						game.chooseClass("TACTICIAN");
					}	
				}
			]
		});
	},
	chooseClass: function(className){
		cards.class = className;
		
		game.init(); 
		main.playSound("mana");
	},
	showTitle: function(){
		game.showOverlay("#title-screen");
		game.state = "title";

		document.querySelector("#version-number").innerHTML = 'v'+game.version;

		main.playSound("music0");

		if(localStorage["leyliner-wins"]){
			game.wins = JSON.parse(localStorage["leyliner-wins"]);
			game.wins.forEach(w=>{
				document.querySelector(".starter-deck.type-"+w.toLowerCase()).classList.add("won-deck");
			});
		}
	},
	wins: [],
	gameOver: function(){
		game.showOverlay("#game-over-screen");
		game.state = "gameover";

		game.eventQueue = [];
		game.animationEffects.forEach(a=>a.cleanupSprite());
		game.animationEffects = [];

		game.talisman = 0;
		game.updateUI();
	},
	win: function(){
		game.showOverlay("#win-screen");
		game.state = "win";
		cards.displayCardList(`#win-screen-inner`, cards.getAllOwned());

		game.wins.push(cards.starterType);
		localStorage["leyliner-wins"] = JSON.stringify(game.wins);
	},
	howToPlay: function(){
		game.showOverlay("#how-to-play-screen");
		game.state = "how-to-play";
	},
	credits: function(){
		game.showOverlay("#credits-screen");
		game.state = "credits";
	},
	animatingMana: [],
	fadingMana: []
}