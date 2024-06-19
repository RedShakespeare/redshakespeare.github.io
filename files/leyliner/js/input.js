input = {
	mousedown: false,
	init: function(){
		 document.querySelector("html").onkeydown = function(e){
		 	const k = e.key.toLowerCase();
		 	const code = e.keyCode;
		 	// don't allow inputs while an async process is happening
		 	// TODO: create input system simiar to GKH that abstracts keypresses from actions
		 	// TODO: create input queue, maybe (depends on if we want super fast gameplay)
		 	// TODO: put tickQueued into game.eventQueue

		 	//console.log(e);
		 	//console.log(k);

		    if(game.state == "title"){
		    	if(k=="enter"){
		    		game.selectDeck("MOON", event);
		    	}
		    }else if(menu.isMenuOpen()){

		        if(k=="escape"){
		        	menu.closeMenu();
		        }else if(k=="enter"){
		 			menu.selectListItem();
		        }else if(code >= 48 && code <= 57){
		 			menu.listItemHandler(code - 48);
		 		}else if(k.length == 1){
		 			menu.typeFilter(k);
		 		}else if(k == "backspace"){
		 			menu.backspaceFilter();
		 		}else if(k == "arrowup"){
		 			menu.moveMenuListSelector(-1);
			    }else if(k == "arrowdown"){
		 			menu.moveMenuListSelector(1);
			    }

			    if(menu.getCurrentTypePrefix() == "VIEW"){
			        input.handleCardViewer(k);
			    }

		 	}else if(game.state == "running" && cards.state != "PROCESSING" &&
	    	!game.eventQueue.length && !game.tickQueued){
	    		if(cards.state == "SELECT"){
	    			// TODO: comment out
			        // if(k=="w" || k == "arrowup") player.tryMove( 0,-1);
			        // if(k=="s" || k == "rrowdown") player.tryMove( 0, 1);
			        // if(k=="a" || k == "arrowleft") player.tryMove(-1, 0);
			        // if(k=="d" || k == "arrowright") player.tryMove( 1, 0);
			        input.handleCardShortcut(e);
			    }else if(cards.state == "POSITION"){
			    	if(k=="enter") game.selectPosition();
			    }


		        if(k=="-") menu.repeat();
		        if(k=="=") menu.repeat(5);
		        if(k=="[") menu.repeat(20);
		        if(k=="]") menu.repeat(100);
		        if(k=="\\") menu.repeat(500);
		        if(k=="tab") cards.hideShow();
		        if(k=="h") cards.hideShow();
		        //if(k=="o") cards.openShop();
		        if(k=="e") game.endTurn();
		        if(k=="0") debug.showDebugMenu();
		        if(k=="i") gear.openInventory();
		        if(k=="t") game.toggleIntents(true);

		        if(k=="escape") input.cancel();

		        input.handleCardViewer(k);
		    }

		    // don't prevent things like reload, dev tools, copy paste, etc
		    if(!e.ctrlKey && !e.metaKey){
	        	e.preventDefault();
	        }
	    };

	    document.querySelector("html").onkeyup = function(e){
		 	const k = e.key;
		 	if(k.toLowerCase()=="t") game.toggleIntents(false);
		};

	    document.querySelector("html").onmousemove = function(e){
	    	if(!menu.isMenuOpen()){
		    	if(game.state == "running" && map.generated && cards.state != "PROCESSING"){
			    	const totalTileSize = scale * tileSize;
			    	const tileX = Math.floor(e.clientX / totalTileSize);
			    	const tileY = Math.floor(e.clientY / totalTileSize);

			    	const selectionChanged = map.selectTile(tileX, tileY);

			    	if(selectionChanged && map.inBounds(tileX, tileY)){
			    		if(cards.state == "TARGET"){
			    			cards.highlightEffectedTiles();
			    		}
			    	}

			    	if(input.mousedown){
			    		input.clickHandler(e);
			    	}
			    }
			}
		};


		document.querySelector("html").onmouseup = function(e){
			input.mousedown = false;
		}

		document.querySelector("html").onmousedown = function(e){
			if(cards.state == "MANA"){
				input.mousedown = true;
			}
		}

		document.querySelector("html").onmouseout = function(e){
			input.mousedown = false;
		}


	    document.querySelector("html").onclick = input.clickHandler;

		window.oncontextmenu = function(event) {
			const e = event;
	    	if(game.state == "running"){
				// debug code

		    	const totalTileSize = scale * tileSize;
		    	const tileX = Math.floor(e.clientX / totalTileSize);
		    	const tileY = Math.floor(e.clientY / totalTileSize);
				const selectedTile = map.getTile(tileX, tileY);

				input.cancel();

			    event.preventDefault();
			    event.stopPropagation();
			    return false;
			}
		};
	},
	handleCardViewer: function(k){
	    if(k=="z") cards.viewCardList('DRAW');
	    if(k=="x") cards.viewCardList('DISCARD');
	    if(k=="c") cards.viewCardList('CARDS');
	    if(k=="v") cards.viewCardList('HAND');
	    if(k=="n") cards.viewCardList('EXHAUST');
	    if(k=="m") cards.viewCardList('MINIONS');
	},
	handleCardShortcut: function(event){
		const num = event.key.charCodeAt(0) - 48;
        if(num >= 1 && num <= cards.hand.length){

        	//in reverse!
        	const card = cards.hand[cards.hand.length - num];

        	if(cards.hoveredCard){
        		cards.unhoverCard(event, cards.hoverCard.id);
        	}
        	cards.hoverCard(event, card.id);

			cards.castCard(event, card.id);
        }
	},
	clickHandler: function(e){
    	const totalTileSize = scale * tileSize;
    	const tileX = Math.floor(e.clientX / totalTileSize);
    	const tileY = Math.floor(e.clientY / totalTileSize);
		if(menu.currentlySelectingTile()){
			const selectedTile = map.getTile(tileX, tileY);
			menu.selectTile(selectedTile);
		}else if(game.state == "running" && cards.state != "PROCESSING"){

	    	map.selectTile(tileX, tileY);
	    	if(cards.state == "TARGET" || cards.state == "MANA"){

		    	if(map.inBounds(tileX, tileY)){
		    		if(cards.state == "TARGET"){
		    			spells.confirmTarget(tileX, tileY);
		    		}else{
		    			cards.confirmManaSelection(tileX, tileY);
		    		}
		    	}

		    }else if(cards.state == "SELECT"){
		    	if(map.inBounds(tileX, tileY)){
		    		const tile = map.getTile(tileX, tileY);
		    		const dist = tile.distance(player.tile);
		    		if(dist == 1){
		    			const dx = tile.x - player.tile.x;
		    			const dy = tile.y - player.tile.y;
		    			//player.tryMove(dx,dy);
		    		}else if(dist == 0){
		    			//game.queueTick();
		    			// we no longer allow waiting... but maybe this should do somethign else?
		    		}

		    		
		    		map.setDebugTile();

		    	}
		    }else if(cards.state == "POSITION"){
		    	if(map.inBounds(tileX, tileY)){
		    		const tile = map.getTile(tileX, tileY);
		    		if(player.canMove(map.selectedTile)){
		    			game.selectPosition(tile);
			    	}
		    	}
		    }
		}
	},
	cancel: function(){
		if(menu.isMenuOpen()){
			menu.closeMenu();
		}else{
			cards.cancel();
		}
	}
}