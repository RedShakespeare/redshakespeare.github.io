cards = {
	nextId: 0,
	cards: {},
	collection: [],
	hand: [],
	deck: [],
	discard: [],
	exhaustPile: [],
	minionPile: [],
	cardsToAnimateToDiscard: [],
	cardWidth: 200,
	cardHeight: 280,
	state: "",
	hide: false,
	/*
		SELECT
		TARGET
	*/
	init: function(){
		 cards.setStarterDeck(cards.selectedStarterDeck);
		//cards.setStarterDeck("BLOOD");
		// cards.createCardInHand("Invoke Electricity");
		// cards.createCardInHand("Invoke Electricity");
		// cards.createCardInHand("Overcharge");
		//cards.createCardInHand("Orbital Strike");
		// cards.createCardInHand("Silver Light");
		// cards.createCardInHand("Silver Light");



		//cards.openShop();
	},
	isStarter: function(spell){
		if(spell.type == "COLORLESS"){
			return false;
		}
		return main.starterDecks[spell.type].find(starter =>Object.keys(starter)[0] == spell.name);
	},
	hoverCard: function(event, id){
		if(cards.state == "SELECT"){
			const card = cards.cards[id];

			if(card != cards.hoveredCard){
				if(cards.hoveredCard){
					cards.unhoverCard(event, cards.hoveredCard.id);
				}
				cards.hoveredCard = card;
				cards.cleanupAnimatingMana();
				const spell = card.spell;
				const cost = card.getActualCost();
				const type = spell.type;

				const manaGroup = spells.getManaToConsume(type, cost);
				if(manaGroup){
					manaGroup.forEach(t=>{
						game.animatingMana.push(t.mana);
					});
				}

				spells.clearSpellHighlights();

				// player won't get an opportunity to see targeting otherwise since we auto-confirm 0 range spells
				if(spell.range == 0){
					cards.currentCard = card;
					map.selectTile(player.tile.x, player.tile.y, /* skipIntents= */ true);
					map.selectedTile = player.tile;
					cards.showRange(spell);
					cards.highlightEffectedTiles();
				}

				//main.playSound("hover");
			}

			//not sure if we should do this.... it kind of obscures mana
			//cards.showRange(spell);
		}
	},
	hoveredCard: null,
	unhoverCard: function(event, id){
		cards.hoveredCard = null;
		if(cards.state == "SELECT"){
			cards.cleanupAnimatingMana();
			spells.clearSpellHighlights();
		}
		main.updateHoverDescriptionCustom("");

		tooltips.hideAllTooltips();
	},
	cards: [],
	cleanupAnimatingMana: function(){
		game.animatingMana.forEach(mana=>{
			if(mana && mana.sprite){
				mana.sprite.visible = true;
			}
		});
		game.animatingMana = [];
	},
	getAllOwned: function(){
		return cards.collection;
	},
	cleanup: function(){
		cards.cards.forEach(c=>{
			if(c.root){
				c.root.remove();
			}
		});
		cards.cards = [];
		cards.collection = [];
		cards.hand = [];
		cards.discard = [];
		cards.deck = [];
		cards.exhaust = [];
		cards.minions = [];
	},

	//get all owned cards and wipe piles
	combineCards: function(){
		cards.deck = cards.collection.concat();
		cards.hand = [];
		cards.discard = [];
		cards.exhaustPile = [];
		cards.minionPile = [];
	},

	// returns minionPile cards to discard if appropriate
	returnMinions: function(triggeringMonster){
		for(let k=cards.minionPile.length-1;k>=0;k--){
			const summonCard = cards.minionPile[k];
			const livingMinion = map.monsters.find(m=>{
				return !m.dead && summonCard.minions.includes(m);
			});
			if(!livingMinion){
				cards.minionPile.splice(k,1);
				
				summonCard.delayedDiscardAnimation(triggeringMonster);
			}
		}
	},

	startLevel: function(){
		cards.combineCards();

		// game.turnCount
		// game.gameDrawNum

		util.shuffle(cards.deck);

		if(game.turnCount == 1){
			// if you have a 0 cost card, guarantee it as the very first draw
			for(let i=cards.deck.length-1;i>=0;i--){
				if(cards.deck[i].spell.cost == 0){
					util.arraySwap(cards.deck, i, cards.deck.length-1);
					break;
				}
			}
		}

		cards.drawNewHand();
		cards.changeState("POSITION");
		map.selector.changeTexture(221);
		game.freeMove = true;

		game.drawIntents();
	},
	//save states for going into menus
	stateStack: [],
	shopCards: [],
	transitionTimer: 0,
	changeState: function(newState){
		if(!newState){
			const prev = cards.stateStack.pop();
			if(prev){
				newState = prev;
			}else{
				game.consoleLog("NO PREVIOUS STATE TO POP");
				return;
			}
		}

		if(cards.state != newState){
			cards.transitionTimerDuration = 500;
			cards.transitionTimer = cards.transitionTimerDuration;
			cards.state = newState;

			game.updateUI();
		}
	},
	goBackToState: function(){
		cards.changeState();
	},
	setStarterDeck: function(deckName){
		cards.starterType = deckName;
		starterDeck = main.starterDecks[deckName];
		starterDeck.forEach(card =>{
			const key = Object.keys(card)[0];
			const value = card[key];
			for(let i=1; i<=value; i++){
				cards.createCardInDeck(key,  /* addToCollection= */ true);
				console.log("created starter card, collection length:"+cards.collection.length)

			}
		});
	},
	getAnimationIndex: function(arrayLength){
		if(arrayLength == undefined) arrayLength = 10;
		return Math.floor(arrayLength*(cards.transitionTimerDuration - cards.transitionTimer)/(cards.transitionTimerDuration));
	},
	handleTransitions: function(delta){
		const timerStartedSet = cards.transitionTimer > 0;
		if(timerStartedSet){
			cards.transitionTimer -= (delta * 1000/60);
		}

		// animate discarded cards
		const end = Math.min(
			cards.cardsToAnimateToDiscard.length-1,
			cards.getAnimationIndex(cards.cardsToAnimateToDiscard.length)
		);
		for(let i=0;i<=end;i++){
			const card = cards.cardsToAnimateToDiscard[i];
			if(card.discardDelayTimer > 0){
				card.discardDelayTimer -= delta;
				continue;
			}
			card.animateToDiscardPile();
		};

		for(let k=cards.cardsToAnimateToDiscard.length-1;k>=0;k--){
			const c = cards.cardsToAnimateToDiscard[k];
			if(c.getX() > window.innerWidth + 200 && 
				c.getY() < -cards.cardHeight - 200){
				cards.cardsToAnimateToDiscard.splice(k,1);
			}
		}


		if(cards.transitionTimer <= 0 && timerStartedSet){
			if(cards.state == "DISCARD"){
				if(!game.levelFinished()){
					cards.drawNewHand();
				}else{
					cards.changeState("SELECT");
				}
				game.freeMove = true;
				game.updateUI();
			}else if(cards.state == "DRAW"){
				cards.startTurn();
			}
		}
	},
	startTurn: function(){
		main.playSound("deal");
		cards.changeState("SELECT");
		game.displayTurnCount();
		
		if(game.turnCount == game.getQuakeTurns()){
			game.quake();
		}
		game.updateUI();
	},
	discardHand: function(){
		cards.changeState("DISCARD");

		//discard all cards
		cards.discard = cards.discard.concat(cards.hand);
		cards.hand = [];
	},

	drawOneCard: function(){
		if(game.levelFinished()){
			return;
		}


		const numDraw = 1 + cards.getOverdraw();
		for(let j=0;j<numDraw; j++){
			cards.actuallyDrawJustOneCard();
		}
		player.removeStatus(StatusOverDraw);
	},
	actuallyDrawJustOneCard: function(){
		if(!cards.deck.length){
			cards.repopulateDeck();
		}

		const topCard = cards.deck.pop();
		if(topCard){
			cards.hand.unshift(topCard);
			topCard.fadeIn();
			topCard.getRoot().classList.remove("exhausted");
		}else{
			//actually this isn't an error any more if you can remove cards
			//throw "No top card!";
		}

		// stop animating to discard pile
		util.removeFromArray(cards.cardsToAnimateToDiscard, topCard);

		if(topCard){
			topCard.setX(-cards.cardWidth - 50, true);
			topCard.setY(-cards.cardHeight - 50, true);
		
			if(cards.state != "DRAW"){
				main.playSound("draw");
			}
		}
	},

	getTotalNumToDraw: function(){
		return game.bonusLevelDraw + game.gameDrawNum;
	},

	getOverdraw: function(){
		if(player.hasStatus(StatusOverDraw)){
			return player.getStatus(StatusOverDraw).level;
		}
		return 0;
	},

	drawNewHand: function(){
		cards.changeState("DRAW");

		//draw new cards (shuffling if necessary)
		let numCardsToDraw = cards.getTotalNumToDraw();

		for(let i=0;i<numCardsToDraw;i++){
			cards.drawOneCard();
		}

		cards.hand.sort((a,b) => b.getHandSortOrder() - a.getHandSortOrder());

		//cards.createCardInHand("Move");
	},
	repopulateDeck: function(){
		cards.deck = util.shuffle(cards.discard);
		cards.discard = [];
	},
	createCardInHand: function(name, addToCollection){
		const newCard = cards.createCard(name);
		cards.hand.unshift(newCard);

		if(addToCollection){
			cards.collection.push(newCard);
		}
	},
	createCardInDeck: function(name, addToCollection){
		const newCard = cards.createCard(name);
		cards.deck.push(newCard);

		if(addToCollection){
			cards.collection.push(newCard);
		}
	},
	createCardInDiscard: function(name, addToCollection){
		const newCard = cards.createCard(name);
		cards.discard.push(newCard);

		if(addToCollection){
			cards.collection.push(newCard);
		}

		return newCard;
	},
	createCard: function(name){
		const spell = main.spellMap[name];
		if(!spell){
			throw(`Tried to create a card that doesn't exit: "${name}"`);
		}
		const card = new Card(spell, '#card-container');


		if(card.rendered){
			//SET IMMEDIATE POSITIONS:
			card.setX(-500*cards.hand.length-500, true);
			card.setY(-500*cards.hand.length-500, true);
		}

		return card;
	},

	viewTypes: {
		DRAW: {
			title: 'Draw Pile',
			getList: ()=>cards.deck,
			shortcut: 'z',
		},
		DISCARD: {
			title: 'Discard Pile',
			getList: ()=>cards.discard,
			shortcut: 'x',
		},
		CARDS: {
			title: 'Cards Owned',
			getList: ()=>cards.getAllOwned(),
			shortcut: 'c',
		},
		HAND: {
			title: 'Hand',
			getList: ()=>cards.hand,
			shortcut: 'v',
		},
		EXHAUST: {
			title: 'Exhaust',
			getList: ()=>cards.exhaustPile,
			shortcut: 'n',
		},
		MINIONS: {
			title: 'Minions',
			getList: ()=>cards.minionPile,
			shortcut: 'm',
		}
	},

	viewCardList: function(type, event){
		if(menu.getCurrentType() == "VIEW."+type){
			menu.closeMenu();
			return;
		}

		let cardList = cards.viewTypes[type].getList().concat();
		cardList.sort((a,b)=>{
			return a.getName().localeCompare(b.getName());
		});

		let title = cards.viewTypes[type].title;
		let shortcut = cards.viewTypes[type].shortcut;

		let content = `<div id="view-card-list-container">`;

		Object.keys(cards.viewTypes).forEach(v=>{
			let viewConfig = cards.viewTypes[v];
			let activeClass = (v == type) ? 'button-active' : '';
			content +=
				`<div
					class="button card-list-button ${activeClass}"
					onclick="cards.viewCardList('${v}', event)"
				>
					<div class="shortcut">${viewConfig.shortcut}</div>
					<span class="button-inner">${viewConfig.title}</span>
					<span>(${viewConfig.getList().length})</span>
				</div>`;
		});

		content += `<div id="cards-owned-inner">`;
		const displayedCards = [];
		cardList.forEach(c => {
			const card = new Card(c.spell, /* parentSelector= */ null, {classList: 'display-card'});
			content += card.getFullHtml();
			displayedCards.push(card);
		});
		content += `</div>`;
		content += `</div>`;

		menu.showMenu({
			type: 'VIEW.'+type,
			title: title,
			content: content,
			event: event,
		});

		displayedCards.forEach(c => {
			c.displayManaCost();
		});
	},

	cancelRemove: function(){
		menu.closeMenu(true);
	},

	removeCardScreen: function(){
		let cardList = cards.getAllOwned().concat();
		cardList.sort((a,b)=>{
			return a.getName().localeCompare(b.getName());
		});

		let content = ``;

		content += `<div class="button" id="remove-cancel-button" onclick="cards.cancelRemove()">
						<span class="button-inner">Cancel</span>
					</div>`;

		content += `<div id="view-card-list-container">`;



		content += `<div id="cards-owned-inner">`;
		cardList.forEach(c => {
			const card = new Card(c.spell, /* parentSelector= */ null, {classList: 'display-card'});
			content += card.getFullHtml();
		});
		content += `</div>`;
		content += `</div>`;

		menu.showMenu({
			type: 'REMOVE-CARD',
			title: 'Remove a card',
			content: content,
			event: event,
			locked: true
		});
	},

	closeViewCards: function(event){
		cards.goBackToState();
		document.querySelector(`#cards-owned`).style.display = "none";
		if(event){
			event.preventDefault();
			event.stopPropagation();
		}
		cards.cardViewState = "";
	},

	pushState: function(newState){
		if(!newState){
 			newState = cards.state;
		}

		const top = cards.stateStack[cards.stateStack.length-1];
		if(top && top == newState){
			//don't push the same thing or we'll end up in a bad state
			return;
		}
		cards.stateStack.push(newState);
	},

	displayCardList: function(selector, cardList){
		if(cards.state != "VIEW"){
			cards.pushState();
		}
		cards.changeState("VIEW");

		let html = ``;

		cardList.sort((a,b)=>{
			return a.getName().localeCompare(b.getName());
		});

		cardList.forEach(c => {
			const card = new Card(c.spell, selector, {classList: 'display-card'});
		});
	},

	/* SHOP */
	cardsPerShopRow: 3,
	shopRows: 1,
	openShop: function(rerollType){
		if((cards.state == "SELECT" && game.talisman > 0) || rerollType){

			if(rerollType){
				menu.closeMenu(true);
			}else{
				game.talisman--;
			}

			main.playSound("attune");

			let content =
				`<div id="card-shop">
					<div id="shop-housekeeping">
						
						<div class="button" id="attunement-view-cards-button" onclick="cards.viewCardList('CARDS')">
							<span class="button-inner">View deck</span>
						</div>`;

			if(!rerollType){
				let rerollColors = Object.keys(colors).filter(color => color != cards.starterType && colors[color].prod);
				rerollColors.push("RANDOM");
				rerollColors.forEach(color => {
					content +=
						`<div class="button reroll-button"
							id="attunement-view-cards-button"
							onclick="cards.openShop('${color}')"
						>
							<div class="reroll-icon type-${color.toLowerCase()}"><div class="card-mana-inner"></div></div>
							<span class="button-inner">
								Reroll
							</span>
						</div>`;
				});
			}

			content +=			`<div class="button" id="cancel-attunement-button" onclick="cards.cancelAttunement()">
							<span class="button-inner">Cancel (+1 max HP)</span>
						</div>
					</div>
					<div id="card-shop-row-container">
						<div id="card-shop-row-0" class="card-shop-row" onclick="cards.selectShopRow(0)">`;

			// NOTE: the below code is still a hacky way of doing a menu, but too much work for now to replace

			cards.shopCards = [];

			let shopType = rerollType || cards.starterType;

			const nonStarterProdSpells = main.spellList.filter(s=>s.prod && !cards.isStarter(s));
			const availableSpells = nonStarterProdSpells.map(s=>s.name);
			const typeSpells = nonStarterProdSpells
									.filter(s=>s.type == shopType || shopType == "RANDOM")
									.map(s=>s.name);

			const numOwned = cards.getAllOwned().length;

			for(let i=0;i<cards.cardsPerShopRow;i++){
				cards.shopCards[i] = [];
			}

			for(let j=0;j<cards.shopRows;j++){
				const rowCards = [];

				let removeIncluded = false;

				for(let i=0;i<cards.cardsPerShopRow;i++){
					// ADD (type or random)
					// 20% of that type means 40% overall (80% / 4 + 20% = 40%)
					//if(util.random()<.2){

					let rowSpellList;

					if(true || i < cards.cardsPerShopRow-1){ // just one random color for now
						rowSpellList = typeSpells;
					}else{
						// for the random spell, make sure it's cheaper than everything else
						const cheapestCost = Math.min(...rowCards.map(r=>main.spellMap[r.spellName].cost));
						rowSpellList = availableSpells.filter(s=>main.spellMap[s].cost <= cheapestCost);
					}

					// filter out cards already in row
					rowSpellList = rowSpellList.filter(s=>{
						return !rowCards.map(rowCard=>rowCard.spellName).includes(s);
					});

					console.log("rowCards",rowCards.map(r=>r.spellName).join(","));
					console.log("rowList", rowSpellList.join(","));

					rowCards.push({
						spellName: util.pickRandom(rowSpellList)
					});
				}		

				rowCards.sort((a,b)=>{
					// // put random type first
					// if(main.spellMap[a.spellName].type != cards.starterType){
					// 	return -1;
					// }else if(main.spellMap[b.spellName].type != cards.starterType){
					// 	return 1;
					// }

					return cards.getShopCardSortCost(a.spellName) - cards.getShopCardSortCost(b.spellName);
				});

				for(let i=0;i<cards.cardsPerShopRow;i++){
					const rowCardInfo = rowCards[i];
					//const card = cards.createShopCard(rowCardInfo.spellName, i, j);
					const spell = main.spellMap[rowCardInfo.spellName];
					const card = new Card(spell, /* parentSelector= */ null, {classList: 'display-card'});
					content += card.getFullHtml();
					cards.shopCards[i][j] = card;
				}
			}

			content += `</div>
					</div>
				</div>`;

			menu.showMenu({
				type: 'SHOP',
				title: 'Leyline Attunement (add a card)',
				content: content,
				locked: true,
				replaceable: false
			});
		}

		cards.selectShopRow(0);
	},
	getShopCardSortCost: function(spellName){
		let cost =  main.spellMap[spellName].cost;
		if(cost == -1){
			return Infinity;
		}
		return cost;
	},
	createShopCard: function(name, i, j){
		const spell = main.spellMap[name];
		const card = new Card(spell, `#card-shop-row-${j}`, {classList: 'mini-card'});

		cards.shopCards[i][j] = card;

		//SET IMMEDIATE POSITIONS:
		card.setX((window.innerWidth-140)*i/cards.cardsPerShopRow, true);
		card.setY(0, true);

		return card;
	},
	selectShopRow: function(index){
		if(menu.getCurrentType() == "SHOP"){
			//for other rows, destroy those cards
			cards.selectedShopRow = index;
			for(let j=0;j<cards.shopRows;j++){
				if(j==index){
					document.querySelector(`#card-shop-row-${j}`).classList.add("selected");
				}else{
					document.querySelector(`#card-shop-row-${j}`).style.display = "none";
				}
				for(let i=0;i<cards.cardsPerShopRow;i++){
					if(j==index){
						cards.shopCards[i][j].getRoot().classList.remove(`mini-card`);
					}else{
						cards.shopCards[i][j].getRoot().remove();
					}
				}
			}

			// TODO: still probably worth refactoring this into a separate menu
			// but for now leaving this hack in to save time
			menu.getCurrentState().type = "SHOP-SELECT";
		}
	},
	selectShopCard: function(card){
		if(card.cardToDelete){
			const existingCardCopy = card.cardToDelete;
			let existingCard;

			//find existingCard that is named similarly to the one selected
			//then delete that one from the first place found in hand/deck/discard

			let inPile;
			const piles = ["hand", "deck", "discard"];
			for(let i=0;i<piles.length;i++){
				if(existingCard = cards.removeFrom(existingCardCopy, piles[i])){
					inPile = piles[i];
					break;
				}
			}

			// be generous
			if(inPile == "hand"){
				cards.drawOneCard();
			}

			if(!inPile){
				// should never happen
				game.consoleLog("card to delete not in hand/deck/discard");
			}
			card.root.remove();

			existingCard[0].razzleDazzle();
		}else{
			//ADD
			document.querySelector("#card-container").appendChild(card.root);
			card.setRotation(360, true);
			card.root.classList.remove("display-card");

			// add to collection (all owned cards) and also hand, as a treat
			cards.hand.unshift(card);
			cards.collection.push(card);

			main.playSound("draw");

			tooltips.hideAllTooltips();
		}

		cards.cleanupShop(card);
	},
	cleanupShop: function(card){
		document.querySelector(`#card-shop`).style.display = "none";
		cards.goBackToState();
		game.consoleLog("cards.state "+cards.state)

		for(let j=0;j<cards.shopRows;j++){
			for(let i=0;i<cards.cardsPerShopRow;i++){
				if(!card || card != cards.shopCards[i][j]){
					cards.shopCards[i][j].root.remove();
				}
			}
		}
		menu.closeMenu(/* overrideLock= */ true);
		game.updateUI();
	},
	cancelAttunement: function(){
		cards.cleanupShop();
		player.maxHp++;
		player.hp++;
		game.updateUI();
	},
	//removes a similar card from the given card pool (hand, deck, discard)
	removeFrom: function(card, cardPool){
		const arr = cards[cardPool];
		for(let i=0;i<arr.length;i++){
			if(arr[i].spell.name == card.spell.name){
				return arr.splice(i,1);
			}
		}
	},
	selectedShopRow: 0,
	arrange: function(){
		if(cards.state != "SELECT" && cards.state != "DRAW"){
			return;
		}

		const mid = cards.hand.length / 2 - 0.5;

		const topOffset = (
			cards.hide
			//|| game.animationEffects.length
		) ? -500 : 0;

		let end = cards.hand.length-1;
		if(cards.state == "DRAW"){
			end = Math.min(
				cards.hand.length-1,
				cards.getAnimationIndex(cards.hand.length)
			);
		}

		const displayWidth = Math.min(187, Math.round(window.innerWidth / (cards.hand.length + 1)));
		const allCardsWidth = cards.hand.length * displayWidth;
		const xOffset = Math.min(
			window.innerHeight, // should be grid width/height
			window.innerWidth - displayWidth * cards.hand.length
		);
		const rotateOffset = Math.min(30 / (cards.hand.length + 1), 5);
		const yOffset = Math.min(10, 40 / (cards.hand.length+1));

		for(let i=0;i<=end;i++){
			const card = cards.hand[i];

			card.setX(
				xOffset + allCardsWidth - (displayWidth * (i+1))
			);
			card.setY(
				cards.calculateTopFromBottom(topOffset + 70+-yOffset*((i-mid)**2))
			);

			card.setRotation(rotateOffset*(mid-i));

			if(card.root.matches(":hover")
			 	// && xOffset < 170
			 ){
				card.setZIndex(1000);
			}else{
				card.setZIndex(-i);
			}
		}
	},
	updateHandManaCosts: function(){
		cards.hand.forEach(c=>{
			c.displayManaCost();
		});
	},
	calculateTopFromBottom: function(bottom){
		return window.innerHeight - cards.cardHeight - bottom;
	},
	hideShow: function(){
		cards.hide = !cards.hide;
		game.updateUI();
	},
	castCard: function(event, id, basicMana){
		const card = cards.cards[id];
		const spell = card.spell;
		spells.currentSpell = spell;
		game.consoleLog(spell);

		if(menu.getCurrentType() == "REMOVE-CARD"){
			cards.removeFrom(card, "collection");
			menu.closeMenu(
				/* overrideLock= */ true,
				/* closeAll= */ true
			);
			game.newLevel();
			return;
		}
		if(menu.getCurrentType() == "SHOP-SELECT"){
			cards.selectShopCard(card);
			event.stopPropagation();
			return;
		}
		if(cards.state != "SELECT"){
			return;
		}

		if(spell.unplayable || !card.canAfford()){
        	card.cardShake = 100;
        	return;
        }

		if(card.inHand()){
			main.playSound("cast");
		

			cards.changeState("TARGET");
			game.toggleIntents(false);

			//card.fadeOut();
			//card.setY(-cards.cardHeight - 100);
			card.setY(window.innerHeight/2 - cards.cardHeight/2);
			card.setX(Math.max(
				window.innerHeight,
				parseFloat(card.getRoot().style.left)
			));
			card.setRotation(0);

			cards.hand.filter(c => c!=card).forEach(c=>{
				c.setY(cards.calculateTopFromBottom(-500));
			});

			cards.currentCard = card;
			cards.basicMana = basicMana;

			const type = card.spell.type;
			const color = colors[type];


			cards.showRange(spell);
			cards.highlightEffectedTiles();

			//confirm immediately if self targeted
			if(spells.getRange()==0){
				map.selectedTile = player.tile;
				spells.confirmTarget(player.tile.x, player.tile.y);
			}

		}

		cards.updateHandManaCosts();

		event.stopPropagation();
	},
	showRange: function(spell){
		const radiusTiles = player.tile.getRadiusTiles(spells.getRange(spell));
		radiusTiles.forEach(t=>{
			t.setHighlight("RANGE");
		});
	},
	highlightEffectedTiles: function(){
		if(map.selectedTile){
			const target = map.selectedTile;
			map.getAllTiles().forEach(t=>t.unsetHighlight(["EFFECT"]));
			const spell = spells.getCurrentSpell();
			spells.getTargets(player, spell, target).forEach(t=>t.setHighlight(["EFFECT"]));
		}
	},
	getUniqueTypesInHand: function(){
		const typesInHand = new Set();
        cards.hand.forEach(c=>typesInHand.add(c.spell.type));
        console.log("types in hand", typesInHand.size);
        return typesInHand;
	},
	basicManas: [],
	sortBasicManas: function(){
		const manaCount = {};
		cards.basicManas.forEach(m=>{
			if(manaCount[m]){
				manaCount[m]++;
			}else{
				manaCount[m] = 1;
			}
		});
		cards.basicManas.sort((a,b)=>{
			if(manaCount[b] == manaCount[a]){
				return (a > b) ? 1 : 0;
			}
			return manaCount[b] - manaCount[a];
		});
	},
	startSelectingMana: function(){
		const canPlaceMana = map.getAllTiles().some(t=>cards.canPlaceMana(t));

		cards.cleanupAnimatingMana();

		if(!canPlaceMana){
			//avoid softlock
			cards.basicManas = [];
		}

		if(game.numEnemiesRemaining() == 0){
			// skip
			// TODO: fix animation
			cards.basicManas = [];
		}

		if(cards.basicManas.length){
			document.querySelector("#phase-mana").innerHTML = `MANA (${cards.basicManas.length})`;
			const manaType = cards.basicManas[0];
			map.selector.changeTexture(colors[manaType].manaSprite);
		}else{
			document.querySelector("#phase-mana").innerHTML = `MANA (-)`;
			//switch to next phase
			map.selector.resetTexture();
			cards.discardHand();
		}

		cards.updateManaPool();
	},

	updateManaPool(){
		let html = ``;
		cards.basicManas.forEach(type=>{
			html += `<div class="mana-pool-mana type-${type.toLowerCase()}">
						<div class="card-mana-inner"></div>
					</div>`
		});
		document.querySelector("#sidebar-mana-pool").innerHTML = html;
					
	},

	// mana placement
	confirmManaSelection: function(tileX, tileY){
		const newTile = map.getTile(tileX, tileY);
		if(cards.canPlaceMana(newTile)){
			const manaType = cards.basicManas.shift();
            newTile.createMana(manaType);
            main.playSound("mana");
            cards.startSelectingMana();
		}
	},
	canPlaceMana: function(newTile){
		return !newTile.monster && !newTile.mana && newTile.passable;
	},
	// currently only used for removing from hand after casting, be careful about other uses
	removeFromHandAfterCasting: function(card){
		// might not have minions if summon failed
		if(spells.spellHasEffect(card.spell, "summon") && card.minions.length){
        	cards.minionPile.push(card);
        	card.setX(card.minions[0].getGlobalX() - cards.cardWidth/2 + (tileSize * scale)/2);
        	card.setY(card.minions[0].getGlobalY() - cards.cardHeight/2 + (tileSize * scale)/2);
        	card.setScale(0);
		}else if(card.spell.exhaust){
			card.exhaust();
        }else{
			cards.discard.push(card);
			card.animateToDiscardPile();
        }
		util.removeFromArray(cards.hand, card);
	},
	cancel: function(){
		if(cards.state == "TARGET"){
			cards.cleanupAnimatingMana();
			cards.currentCard.opaque();

        	cards.backToShowingHand();

        	spells.clearSpellHighlights();
		}else if(cards.state == "SELECT"){
			cards.hideShow();
		}
	},
	confirmCardUse: function(){
		cards.currentCard.discount = 0;

        cards.removeFromHandAfterCasting(cards.currentCard);

        cards.backToShowingHand();

        //game.queueTick();

        cards.currentCard = null;
	},
	backToShowingHand: function(){
		cards.changeState("SELECT");
        cards.hide = false;
		cards.currentCard = null;
		map.selector.resetTexture();

		if(game.talisman){
			cards.openShop();
		}
	}
}
