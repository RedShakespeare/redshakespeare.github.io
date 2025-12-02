menu = {
	// a stack of menu options, the latest representing the current menu being displayed
	states: [],
	selectingTileHandler: null,
	previousSelectionHandler: null,
	previousSelectionTile: null,
	repeat: function(times){
		if(times == undefined) times = 1;
		for(let i=0;i<times;i++){
			if(menu.previousSelectionHandler){
				menu.executeSelectionHandler(
					menu.previousSelectionHandler,
					menu.previousSelectionTile
				);
			}
		}
	},
	currentlySelectingTile: function(){
		return menu.isMenuOpen() && !!menu.selectingTileHandler;
	},
	getSelectingDescription: function(){
		if(menu.getCurrentState().selectingDescription){
			return menu.getCurrentState().selectingDescription;
		}else{
			return "Select a tile.";
		}
	},
	selectTile: function(tile){
		menu.executeSelectionHandler(
			menu.selectingTileHandler,
			tile
		);
	},
	// tile is optional
	executeSelectionHandler: function(handler, tile){
		try{
			handler(tile);
		}catch(e){
			debug.showErrorHighlight();
			console.log("error while executing selection handler: "+e);
		}
		if(menu.isMenuOpen() && menu.getCurrentState().closeAfterSelection){
			menu.closeMenu(true);
		}
		game.updateUI();

		menu.previousSelectionHandler = handler;
		menu.previousSelectionTile = tile;
	},
	isMenuOpen: function(){
		return menu.states.length > 0;
	},
	isMenuListOpen: function(){
		if(menu.isMenuOpen() && !!menu.getCurrentState().listItems){
			return true;
		}else{
			return false;
		}
	},
	getCurrentState: function(){
		return menu.states[menu.states.length-1];
	},
	getCurrentType: function(){
		if(!menu.states.length){
			return "No menu";
		}
		return menu.getCurrentState().type;
	},
	getCurrentTypePrefix: function(){
		const type = menu.getCurrentType();
		return type.split(".")[0];
	},
	/*
		Show Menu: display a menu (any content in a window) that doesn't interfere with game state
		
		options:
			type: short type string for later reference
			title: header title
			content: main content, can be any html
			event: pass to stop propagation
			extraMenuClass: a class to add to the outer #menu div
			menuSize: how big (fullsized/small), default is fullsized
			clickToClose: if true, left clicking will close the menu
			locked: true if closing the menu requires an override parameter
						for example, don't close an attune menu accidentally
			replaceable: if the menu should be replaced when a new menu is opened
							or instead stacked upon (think browser history)

		example

			menu.showMenu({
				type: 'TEST',
				title: 'Test Title',
				content: 'Some <em>Test</em> Content',
			});
	*/
	showMenu: function(options){
		if(options.replaceable === undefined) options.replaceable = true;
		if(!options.extraMenuClass) options.extraMenuClass = '';
		if(!options.menuSize) options.menuSize = 'fullsized';

		if(options.event){
			event.preventDefault();
			event.stopPropagation();
		}

		document.querySelector('#menu-title').innerHTML = options.title;
		document.querySelector('#menu-content #menu-content-inner').innerHTML = options.content;

		document.querySelector(`#menu`).style.display = "flex";
		document.querySelector(`#menu`).className = options.menuSize + ' ' +options.extraMenuClass;

		if(options.clickToClose){
			document.querySelector("#menu").onclick = (event) => {
				event.stopPropagation();
				event.preventDefault();
				menu.closeMenu();
			};
		}else{
			document.querySelector("#menu").onclick = (event) => {
				event.stopPropagation();
				event.preventDefault();
			};
		}

		const currentState = menu.getCurrentState();

		// REPLACE
		if(currentState && currentState.replaceable){
			menu.states.pop();
		}

		menu.states.push(options);

		menu.selectingTileHandler = null;

		document.querySelector("#menu-filter").innerHTML = "";
	},
	hideMenu: function(){
		document.querySelector(`#menu`).style.display = "none";
		menu.filter = "";
	},
	closeMenu: function(overrideLock, closeAll){
		if(!menu.isMenuOpen()){
			return;
		}
		// some menus, especially anything with an important selection,
		// can only be closed in specific ways (e.g. attune)
		if(menu.getCurrentState().locked && !overrideLock){
			return;
		}

		if(closeAll){
			menu.states = [];
		}else{
			menu.states.pop();
		}

		menu.hideMenu();

		// show previous menu, if applicable
		const state = menu.getCurrentState();
		if(state){
			// pop off first, because it will be pushed again
			menu.states.pop();
			menu.showMenu(state);
		}

		// resume autopickup if necessary
		game.delayedAutoPickup();
	},
	/*
		similar to showMenu, but it requires a listItems property instead of content

		listItems is an array of objects each with 'title' and 'handler'

		additional options:
			selectTileOnItemSelection: true if a tile needs to be selected before executing an item handler
										the item handler will be passed a tile parameter
			selectingDescription: the description to add during tile selection

	*/
	showMenuList: function(options){
		options.content = options.listItems.map((i,index)=>{

			let content = `
			<div 
				id="menu-list-item-${index}"
				class="menu-list-item" 
				onclick="menu.listItemHandler(${index}, event)"
			>
				<div class="menu-list-item-number">
					${index < 10 ? index : '*'}
				</div>
				<div class="menu-list-item-description">
					${i.title}
				</div>
			</div>`;
			return content;
		}).join('');
		menu.showMenu(options);

		menu.listItemIndex = 0;
		menu.hoverListItem();
		menu.filter = "";
	},
	filter: "",
	typeFilter: function(char){
		menu.filter += char;
		menu.filterMenuList();
	}, 
	backspaceFilter: function(){
		menu.filter = menu.filter.substring(0,menu.filter.length-1);
		menu.filterMenuList();
	},
	filterMenuList: function(){
		if(menu.isMenuListOpen()){
			menu.listItemIndex = null;
			const items = menu.getCurrentState().listItems;
			if(items){
				items.forEach((i,index)=>{
					const e = document.querySelector("#menu-list-item-"+index);
					if(i.title.toLowerCase().includes(menu.filter.toLowerCase())){
						e.style.display = "flex";
						if(menu.listItemIndex == null){
							menu.listItemIndex = index;
						}
					}else{
						e.style.display = "none";	
					}
				})
			}
			if(menu.listItemIndex == null){
				menu.listItemIndex = 0;
			}
			menu.hoverListItem();

			document.querySelector("#menu-filter").innerHTML = menu.filter;
		}
	},
	listItemIndex: 0,
	selectListItem: function(){
		menu.listItemHandler(menu.listItemIndex);
	},
	hoverListItem: function(){
		document.querySelectorAll(".menu-list-item").forEach(e=>e.classList.remove('active'));
		document.querySelector("#menu-list-item-"+menu.listItemIndex)?.classList.add('active');
	},
	moveMenuListSelector: function(delta){
		const items = menu.getCurrentState().listItems;
		if(items){
			menu.listItemIndex += delta;
			if(menu.listItemIndex < 0){
				menu.listItemIndex = items.length - 1;
			}
			if(menu.listItemIndex > items.length - 1){
				menu.listItemIndex = 0;
			}
			menu.hoverListItem();
		}
	},
	listItemHandler: function(index, event){
		if(event){
			event.stopPropagation();
			event.preventDefault();
		}

		const state = menu.getCurrentState();
		const items = state.listItems;
		if(items && index < items.length){
			const handler = items[index].handler;

			// hmm, this code was kind of unncessary since we have map.selectedTile?
			if(false && state.selectTileOnItemSelection){
				menu.selectingTileHandler = handler;
				menu.hideMenu();
			}else{
				menu.executeSelectionHandler(handler, map.selectedTile || window.player?.tile);
			}
		}
	}
}