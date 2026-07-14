class Card{
	constructor(spell, parentSelector, options){
		if(!options){
			options = {};
		}
		this.options = options;

		this.spell = spell;
		this.rendered = false;

		this.scale = 1;
		this.rotation = 0;

		this.discount = 0;

		this.id = cards.nextId++;
		cards.cards[this.id] = this;

		this.cardShake = 0;

		this.parentSelector = parentSelector;

		// A list of all monsters summoned by this card so we know when it should be returned to discard
		this.minions = [];

		if(parentSelector){
			this.render();
		}
	}

	exhaust(){
    	cards.exhaustPile.push(this);
    	this.fadeOut();
		this.getRoot().classList.add("exhausted");
		main.playSound("miss");
	}

	getHandSortOrder(){
		if(this.getDisplayName() == "Move"){
			return Number.NEGATIVE_INFINITY;
		}else if(this.spell.cost == -1){
			return Number.POSITIVE_INFINITY;
		}else{
			return this.spell.cost;
		}
	}

	getName(){
		return this.spell.name;
	}

	render(){
		const div = document.createElement('div');
		div.className = this.getCompleteClassList();
		div.innerHTML = this.getHtml();
		div.id = this.getId();
		this.root = document.querySelector(this.parentSelector).appendChild(div);
		this.rendered = true;

		this.displayManaCost();
	}

	getIdSelector(){
		return "#"+this.getId();
	}

	getId(){
		return "card-"+this.id;
	}

	getRoot(){
		const newRoot = document.querySelector(this.getIdSelector());
		if(newRoot){
			this.root = document.querySelector(this.getIdSelector());
		}
		return this.root;
	}

	getCompleteClassList(){
		let list = `card  type-${this.spell.type.toLowerCase()}`;
		if(this.options.classList){
			list += ' ' + this.options.classList;
		}
		return list;
	}

	delayedDiscardAnimation(monster){
		if(monster){
			this.setX(monster.getGlobalX()-100, true);
			this.setY(monster.getGlobalY()-150, true);
		}

		this.animateToCenter();

		this.setScale(0.01, true);
		this.setScale(1);
		//this.setRotation(360,true);
		//this.setRotation(0);
		this.setZIndex(2000);

		cards.cardsToAnimateToDiscard.push(this);
		cards.discard.push(this);

		this.discardDelayTimer = 70;
	}

	animateToDiscardPile(immediate){
		this.setX(window.innerWidth + 400, immediate);
		this.setY(-cards.cardHeight - 400, immediate);
	}

	animateToCenter(){
		this.setX(window.innerWidth/2 - cards.cardWidth/2);
		this.setY(window.innerHeight/2 - cards.cardHeight/2);
	}

	inHand(){
		return cards.hand.includes(this);
	}

	inDeck(){
		return cards.deck.includes(this);
	}

	inDiscard(){
		return cards.discard.includes(this);
	}

	removeElement(){
		this.getRoot().remove();
	}

	hide(){
		this.getRoot().style.opacity = 0;
	}

	fadeOut(){
		this.getRoot().style.opacity = 1;
		util.animate(this.getRoot().style, "opacity", 0);
		this.getRoot().classList.add("uninteractable");
	}

	fadeIn(){
		this.getRoot().style.opacity = 0;
		util.animate(this.getRoot().style, "opacity", 1);
		this.getRoot().classList.remove("uninteractable");
	}

	opaque(){
		this.getRoot().style.opacity = 1;
		this.getRoot().classList.remove("uninteractable");
	}

	getX(){
		let left = this.getRoot().style.left;
		if(!left){
			return 0;
		}else{
			return left.replace("px","");
		}
	}

	getY(){
		let top = this.getRoot().style.top;
		if(!top){
			return 0;
		}else{
			return top.replace("px","");
		}
	}

	setX(x, immediate){
		x += this.cardShake * (Math.random()-0.5);
		this.cardShake *= .95;
		if(this.cardShake < 5){
			this.cardShake = 0;
		}

		if(immediate){
			this.getRoot().style.left = x + "px";
		}
		if(this.getRoot().style.left == ''){
			this.getRoot().style.left = "-500px";
		}
		util.animate(this.getRoot().style, "left", x);

		//game.consoleLog("SET X "+x + "  immediate:"+!!immediate)
	}

	setY(y, immediate){
		y += this.cardShake* (Math.random()-0.5);
		this.cardShake *= .95;
		if(this.cardShake < 5){
			this.cardShake = 0;
		}

		if(immediate){
			this.getRoot().style.top = y + "px";
		}
		if(this.getRoot().style.top == ''){
			this.getRoot().style.top = "-500px";
		}

		util.animate(this.getRoot().style, "top", y);
	}

	razzleDazzle(){
		this.setX(window.innerWidth/2 - 100);
		this.setY(window.innerHeight/3 - 150);
		this.setRotation(360, true);
		this.fadeOut();

		setTimeout(()=>{this.getRoot().remove()}, 5000);
	}

	setRotation(angle, immediate){
		if(immediate){
			this.rotation = angle;
		}else{
			util.animate(this, "rotation", angle, {
				postAnimateHandler: ()=>{this.updateTransform()}
			});
		}

		this.updateTransform();
	}

	setScale(scale, immediate){
		if(immediate){
			this.scale = scale;
		}else{
			util.animate(this, "scale", scale, {
				postAnimateHandler: ()=>{this.updateTransform()
			}});
		}

		this.updateTransform();
	}

	updateTransform(){
		const root = this.getRoot();
		if(root){
			root.style.transformOrigin = `center`;
			root.style.transform = `scale(${this.scale}) rotate(${this.rotation}deg)`;
		}
		
	}

	setZIndex(index){
		if(!index) index = cards.nextId;
		const root = this.getRoot();
		if(root){
			root.style.zIndex = 100 + index;
		}
	}

	getFullDescription(){
		let description = this.spell.description;
		description = spells.generateSpellDescription(this.spell, description, this);
		return tooltips.replaceKeywords(this.id, description);
	}

	showTooltip(content, index){
		tooltips.createTooltipOnElement(
			this.getRoot().querySelector(".card-inner"),
			content,
			index
		);
	}

	// getHtml didn't account for outer div
	getFullHtml(){
		return `<div id="card-${this.id}" class="${this.getCompleteClassList()}">
			${this.getHtml()}
		</div>`;
	}

	updateDescription(){
		this.getRoot().querySelector(".card-description").innerHTML = this.getFullDescription();
	}

	displayManaCost(){
		const root = this.getRoot();
		root.classList.remove("unaffordable");
		root.classList.remove("unplayable");
		root.classList.remove("discounted");
		if(!this.canAfford()){
			root.classList.add("unaffordable");
		}
		if(this.spell.unplayable){
			root.classList.add("unplayable");
		}
		if(this.spell.cost != this.getActualCost()){
			//Assumes discount, when bad cost increases introduce change above
			root.classList.add("discounted");
		}
		this.getRoot().querySelector(".card-cost").innerHTML = this.getDisplayCost();
	}

	canAfford(){
		const type = this.spell.type;
		let cost = this.getActualCost();
        if(!shouldConsumeMana){
            game.consoleLog("BYPASSING MANA CHECK");
            return true;
        }

        if(cost == 0){
            return true;
        }

        const consumedMana = spells.getManaToConsume(type, cost);
        if(consumedMana && consumedMana.length){
            return true;
        }else{
            return false;
        }
	}

	getActualCost(){
		let cost = spells.checkEpiphanyCost(this.spell.cost);

		if(this.discount && this.spell.cost != -1){
			cost = Math.max(0, cost - this.discount);
		}

		return cost;
	}

	getDisplayCost(){
		if(this.spell.cost == -1){
			return "X"
		}else{
			return this.getActualCost();
		}
	}

	getDisplayName(){
		let name = this.spell.name;
		return name.replace(/\[[A-Za-z]*\]/, "").trim();
	}

	getHtml(){
		return `<div class="card-inner"
					onclick="cards.castCard(event, ${this.id}, false)"
					onmouseover="cards.hoverCard(event, ${this.id})"
					onmouseleave="cards.unhoverCard(event, ${this.id});"
				>
				<div class="card-header">
					<div class="card-cost">
						${this.getDisplayCost()}
					</div>
					<div class="shortcut">1</div>
					<div class="card-title">
						${this.getDisplayName()}
					</div>
				</div>
				<div class="card-description">
					${this.getFullDescription()}
				</div>
				<div class="card-mana" onclick="cards.castCard(event, ${this.id}, false)">
					<div class="card-mana-inner"></div>
				</div>
			</div>`;
	}
}