main = {
	assetsLoaded: 0,
	markAssetLoaded: function(assetName){
		if(assetName){
			main.logTime(assetName);
		}
		if(--main.assetsLoaded==0){
			main.postLoad();
		}
	},
	init: function(){
		app = new PIXI.Application({ width: window.innerWidth, height: window.innerHeight });

		mainContainer = new PIXI.Container();

		tileContainer = new PIXI.Container();
		manaContainer = new PIXI.Container();
		itemContainer = new PIXI.Container();
		threatContainer = new PIXI.Container();
		monsterContainer = new PIXI.Container();
		intentsContainer = new PIXI.Container();
		effectsContainer = new PIXI.Container();
		selectorContainer = new PIXI.Container();

		mainContainer.addChild(tileContainer);
		mainContainer.addChild(manaContainer);
		mainContainer.addChild(itemContainer);
		mainContainer.addChild(threatContainer);
		mainContainer.addChild(monsterContainer);
		mainContainer.addChild(intentsContainer);
		mainContainer.addChild(effectsContainer);
		mainContainer.addChild(selectorContainer);

		app.stage.addChild(mainContainer);

		threatContainer.visible = false;

		document.querySelector("#canvas-container").appendChild(app.view); 

  		let elapsed = 0.0;

		PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
  		const loader = new PIXI.Loader();
		loader.add("img/ss.png");
		loader.add("img/icons.png");
		loader.add("img/tinyversefont.png");
		main.assetsLoaded+=3;
		loader.load((loader, resources) => {
			Object.keys(resources).forEach(r=>main.markAssetLoaded(r));
		});

		main.loadSounds();

		main.loadJson('monsters', monsters=>{
			main.monsterTypeMap = {};
			main.monsterTypes = monsters;
			monsters.forEach(m=>{
				main.monsterTypeMap[m.name]=m;
			});
		});

		main.loadJson('spells', spells=>{
			main.spellMap = {};
			main.spellList = spells;
			spells.forEach(s=>{
				main.spellMap[s.name]=s;
			});
		});

		main.loadJson('gear', gear=>{
			main.gearMap = {};
			main.gearClassMap = {};
			main.gearList = gear;
			gear.forEach(g=>{
				main.gearMap[g.name]=g;
				main.gearClassMap[g.className]=g;
			});
		});

		main.loadJson('starterDecks', starterDecks=>{
			main.starterDecks = starterDecks;
		});

		main.currentTime = performance.now();

  		app.ticker.add((delta) => {
  			try{
				//I have a suspicion delta is not accurate
				const customDelta = (performance.now() - main.currentTime) / (1000/60);
	  			main.currentTime = performance.now();
	    		util.processAnimations(customDelta);

	  			if(game.state == "running"){

		    		elapsed += customDelta;

		    		// don't do shit while animation effects happening
		    		if(!game.animationEffects.length){
		    			game.processEvents(customDelta);

		    			if(!game.eventQueue.length){
				    		if(game.tickQueued && !game.eventQueue.length){
				    			game.tick();
				    		}else if(cards.state == "MONSTERS"){
								game.startManaPhase();
				    		}
				    	}
			    	}


		    		cards.handleTransitions(customDelta, customDelta);
		    		cards.arrange();
		    		document.querySelectorAll("#sidebar-phase span").forEach(s=>{
		    			s.classList.remove("active");
		    		});

		    		document.querySelector("#sidebar-phase-description").classList.remove("blink");
		    		if(menu.currentlySelectingTile()){
		    			document.querySelector("#sidebar-phase-description").classList.add("blink");
		    			document.querySelector("#sidebar-phase-description").innerHTML = menu.getSelectingDescription();
		    		}else if(cards.state == "SELECT"){
		    			document.querySelector("#phase-play").classList.add("active");
		    			document.querySelector("#sidebar-phase-description").innerHTML = "Hold (<strong>T</strong>) or hover monsters for threatened tiles.";
		    		}else if(cards.state == "TARGET"){
		    			document.querySelector("#phase-target").classList.add("active");
		    			document.querySelector("#sidebar-phase-description").classList.add("blink");
		    			document.querySelector("#sidebar-phase-description").innerHTML = "Select a target.";
		    		}else if(cards.state == "MANA"){
		    			document.querySelector("#phase-mana").classList.add("active");
		    			document.querySelector("#sidebar-phase-description").classList.add("blink");
		    			document.querySelector("#sidebar-phase-description").innerHTML = "Click/drag on tiles to place mana. Or press <strong>e</strong> again to skip.";
		    		}else if(cards.state == "DRAW" || cards.state == "DISCARD"){
		    			document.querySelector("#phase-draw").classList.add("active");
		    			document.querySelector("#sidebar-phase-description").innerHTML = "";
		    		}else if(cards.state == "POSITION"){
		    			//document.querySelector("#phase-enter").classList.add("active");
		    			document.querySelector("#sidebar-phase-description").classList.add("blink");
		    			document.querySelector("#sidebar-phase-description").innerHTML = "Select a starting position.<br>Hold (<strong>T</strong>) or hover monsters for threatened tiles.";
		    		}

		    		if(game.showIntents){
		    			intentsContainer.alpha = 1;
		    		}else{
		    			intentsContainer.alpha *= .95;
		    		}


		    		for(let k=game.animationEffects.length-1;k>=0;k--){
		    			const a = game.animationEffects[k];
		    			if(a.update(customDelta)){
		    				a.cleanupSprite();
		    				game.animationEffects.splice(k,1);
		    			}
		    		}


		    		const screenshakeAngle = 2*Math.PI*Math.random();
		    		mainContainer.x = game.screenshake * Math.cos(screenshakeAngle);
		    		mainContainer.y = game.screenshake * Math.sin(screenshakeAngle);

		    		map.monsters.concat(player).forEach(m=>m.drawUpdate(customDelta,elapsed));

		    		game.animatingMana.forEach(m=>{
		    			m.drawUpdate(customDelta,elapsed);
		    		});
		    	}
		    }catch(e){
				debug.showErrorHighlight();
		    	console.error('error in ticker',e);
		    }
  		});

  		input.init();
	},
	soundSources: {
		"deal": "sounds/cardFan1.ogg",
		"draw": "sounds/cardPlace1.ogg",
		"cast": "sounds/cardSlide1.ogg",
		"attune": "sounds/dieThrow1.ogg",
		"playerHit": "sounds/crit.wav",
		"monsterHit": "sounds/hit4.wav",
		"footstep": "sounds/footstep1.ogg",
		"item": "sounds/book.ogg",
		"glassBreak": "sounds/GlassSmash2.wav",
		"damageMOON": "sounds/damageMOON.wav",
		"damageFIRE": "sounds/damageFIRE.wav",
		"damageFIRE-QUIET": "sounds/damageFIRE-QUIET.wav",
		"damageELEC": "sounds/damageELEC.wav",
		"mana": "sounds/chipLay1.ogg",
		"doorOpen": "sounds/doorOpen_1.ogg",
		"miss": "sounds/miss.wav",
		"music1": "sounds/John Bartmann - invocation-master.mp3",
		"music2": "sounds/John Bartmann - ice-crystal-harp-master.mp3",
		"music3": "sounds/John Bartmann - lurking-deep-master.mp3",
		"music0": "sounds/John Bartmann - straight-towards-the-sun-master.mp3"
	},
	sounds: [],
	playSound: function(name){
		if(main.sounds[name]){
			if(name.indexOf("music") > -1){
				main.fadeMusic(name);
				if(main.musicOn){
					main.sounds[name].play();
				}
			}else{
				if(main.soundOn){
					main.sounds[name].play();
				}
			}
		}
	},
	fadeMusic: function(name){
		Object.keys(main.soundSources).forEach(k=>{
			//fade in specific music
			if(k==name){
				if(main.musicOn){
					// 10% volume
					main.sounds[k].fade(0, .1, 1000);
				}
			}
			//fade out anything playing
			if(main.sounds[k].playing()){
				if(main.sounds[k].volume() > 0){
					main.sounds[k].fade(main.sounds[k].volume(), 0, 250);
				}
			}
		});
	},
	// much faster loading time (music takes 2+ seconds to load)
	disableMusic: false,
	loadSounds: function(){
		main.logTime("LOAD SOUNDS");

		Object.keys(main.soundSources).forEach(k=>{
			if(!main.disableMusic || k.indexOf("music") == -1){
				const sound = new Howl({
					src: [main.soundSources[k]],
					loop: k.indexOf("music") > -1,
					onfade: ()=>{
						if(sound.volume()==0){
							sound.stop();
						}
					}
				});
				main.sounds[k] = sound;
				main.assetsLoaded++;
				sound.once('load', function(){
				  main.markAssetLoaded(main.soundSources[k]);
				});
			}
		});
	},
	musicOn: true,
	soundOn: true,
	options: true,
	logTime: function(text){
		game.consoleLog(text, (performance.now() - startLoad) / 1000);
	},
	toggleOptions: function(){
		main.options = !main.options;
		const optionsButton = document.querySelector("#options-button");
		if(main.options){
			optionsButton.classList.add("button-active");
			document.querySelectorAll('.options').forEach(e=>{
				e.style.display = "none";
			});			
		}else{
			optionsButton.classList.remove("button-active");
			document.querySelectorAll('.options').forEach(e=>{
				e.style.display = "block";
			});
		}
		main.playSound("mana");
	},
	toggleSound: function(){
		main.soundOn = !main.soundOn;
		const soundButton = document.querySelector("#sound-button");
		soundButton.innerHTML = main.soundOn ? "sound on" : "sound off";
		if(main.soundOn){
			soundButton.classList.add("button-active");
		}else{
			soundButton.classList.remove("button-active");
		}

		main.playSound("mana");
	},
	toggleMusic: function(){
		main.musicOn = !main.musicOn;
		const musicButton = document.querySelector("#music-button")
		musicButton.innerHTML = main.musicOn ? "music on" : "music off";
		if(main.musicOn){
			musicButton.classList.add("button-active");
		}else{
			musicButton.classList.remove("button-active");
		}
		main.playSound("music0");
		main.playSound("mana");
	},
	postLoad: function(){
		main.logTime("POST LOAD");
		spritesheetTexture = PIXI.Texture.from('img/ss.png');
		iconSpritesheetTexture = PIXI.Texture.from('img/icons.png');
		tinyverseTexture = PIXI.Texture.from('img/tinyversefont.png');

		game.state = "title";

		//todo: randomly spawn monsters/player

		map.selector = new Selector(101, 0,0);
		map.selector.skipCleanup = true;


		initColors();



		//cards.updateHandManaCosts();


		//game.init();

		game.showTitle();
	},
	loadJson: function(name, callback){
		main.assetsLoaded++;
		util.ajax(`config/${name}.json?${Math.random()}`, (response)=>{
			callback(JSON.parse(response));

			main.markAssetLoaded(name);
		});
	},
	updateHoverDescription: function(){
		if(map.selectedTile){
			const tile = map.selectedTile;
			const monster = tile.monster;
			const mana = tile.mana;
			const item = tile.item;
			let sidebarHtml = "";
			if(monster){
				const monsterDescriptionId = "monster-description";
				// TODO: figure out a way to get tooltips on monster descriptions
				const fullDescription = tooltips.replaceKeywords(
					monsterDescriptionId,
					monster.getDescription()
				);
				
				sidebarHtml = `<div id="${monsterDescriptionId}">
					<strong>${monster.getName()}</strong><br>
					${monster.hp}/${monster.getMaxHp()} HP<br>
					${monster.calculateAttack()} Attack<br>`

				if(monster.calculateRange()>1){
					sidebarHtml += `${monster.calculateRange()} Range<br>`;
				}

				sidebarHtml +=	`${fullDescription}</div><br>`;

				monster.statuses.forEach(s=>{
					sidebarHtml += `<strong>${s.name}`;
					if(s.level>1 && s.canStack){
						sidebarHtml += ` (${s.level})`;
					}
					sidebarHtml += `</strong>`;
					if(s.ttl > -1){
						sidebarHtml += ` - ${s.ttl} turn${s.ttl==1 ? ``:`s`} left`;
					}
					sidebarHtml += `<br>`;
					if(s.direction != undefined){
						sidebarHtml += `direction: ${util.getDirectionName(s.direction)}<br>`;
					}
					sidebarHtml += `${s.getDescription(monster)}<br><br>`;
				});
			}else if(mana){
				sidebarHtml = `<strong>${util.capitalize(mana.type)} Mana</strong><br>
					${colors[mana.type].description}<br><br>
					Deals 1 damage if stepped on.<br>
				`;
			}else if(item){
				sidebarHtml = `<strong>${item.getName()}</strong><br>
					${item.getDescription()}<br>
				`;
			}else if(tile.name && tile.description){
				sidebarHtml = `<strong>${tile.name}</strong><br>
				${tile.description}<br>`;
			}

			document.querySelector("#sidebar-hover-info").innerHTML = sidebarHtml;
		}
	},
	updateHoverDescriptionCustom: function(html){
		document.querySelector("#sidebar-hover-info").innerHTML = html;
	}
}