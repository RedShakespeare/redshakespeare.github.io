tooltips = {
	hideAllTooltips: function(){
		document.querySelectorAll(".tooltip").forEach(e=>e.remove());
	},
	createTooltipOnElement: function(parentElement, content, index, options){
		if(!options) options = {};
		if(index == undefined) index = 0;

		const tooltipElement = document.createElement('div');
		tooltipElement.classList.add("tooltip");
		parentElement.appendChild(tooltipElement);

		tooltipElement.innerHTML = content;
		tooltipElement.style.display = 'block';

		const offset = `calc(${index+1}00%)`;
		if(options.topBottomOrientation){
			if(tooltipElement.getBoundingClientRect().top < window.outerHeight / 2 ){
				tooltipElement.style.top = offset;
			}else{
				tooltipElement.style.bottom = offset;
			}
		}else{
			if(tooltipElement.getBoundingClientRect().left < window.outerWidth / 2 ){
				tooltipElement.style.left = offset;
			}else{
				tooltipElement.style.right = offset;
			}
		}

		if(options.alignRightEdge){
			tooltipElement.style.right = 0;
		}
	},
	showPotionTooltip: function(index){
		const potion = game.potions[index];

		const content = `<h3 class="tooltip-highlight">${potion.getName()}</h3>
			${potion.getDescription()}`;

		tooltips.createTooltipOnElement(
			document.querySelector(`#potion-${index}`),
			content,
			0,
			{
				topBottomOrientation: true,
				alignRightEdge: true
			}
		);
	},
	showOnCard: (id, keywordTitle, index)=>{
		if(!index) index = 0;

		const keyword = tooltips.keywords.find(k=>k.title==keywordTitle);
		const content = tooltips.getContent(keyword);
		const body = keyword.body;

		if(index == 0){
			tooltips.hideAllTooltips();
		}
		cards.cards[id].showTooltip(content, index);

		tooltips.keywords.forEach(otherKeyword => {
			// no stack overflows plz
			if(body.match(otherKeyword.title) && index < 10){
				tooltips.showOnCard(id, otherKeyword.title, index+1);
			}
		});
	},
	// currently multiple replaces are happening, so don't reference a keyword here unless it comes EARLIER in the keywords object
	// TODO: less brittle replace (e.g. don't replace in html tags)
	keywords: [
		{
			title: "MINION",
			class: "ally-tooltip",
			body:  'A monster you have summoned to do your bidding. Minions act automatically (before enemies) and they never step on your mana.'
		},
		{
			title: "TOTEM",
			class: "ally-tooltip",
			body:  'A noncombatant that does not move.'
		},
		{
			title: "ALLY",
			class: "ally-tooltip",
			body:  'You or a MINION.'
		},
		{
			title: "SUMMON",
			class: "ally-tooltip",
			body:  'Summon a MINION to do your bidding. This card returns to your discard pile only after that MINION has died.'
		},
		{
			title: "ILLUMINATED",
			class: "type-moon",
			body:  `Increases damage taken by 1 per stack.`
		},
		{
			title: "PHASE",
			class: "type-moon",
			body:  `Place your highest cost card on the bottom of your deck to draw 1.`
		},
		{
			title: "OVERDRAW",
			class: "type-moon",
			body:  `Draw an additional card next turn for each stack.`
		},
		{
			title: "ECLIPSED",
			class: "type-moon",
			body:  `Reduces damage taken by 1 per stack.`
		},
		{
			title: "SHOCKED",
			class: "type-elec",
			body:  StatusShocked.description
		},
		{
			title: "BLOOD SCENT",
			class: "type-blood",
			body:  StatusScent.description
		},
		{
			title: "STORMED",
			class: "type-elec",
			body:  StatusStormed.description
		},
		{
			title: "BERSERK",
			class: "type-blood",
			body:  "Increases damage by 1 per stack."
		},
		{
			title: "VIGOR",
			class: "type-blood",
			body:  "Doubles healing received."
		},
		{
			title: "BOLSTER",
			class: "type-blood",
			body:  "Spell damage is converted into decaying bonus HP."
		},
		{
			title: "ENGORGE",
			class: "type-blood",
			body:  "MINION gains max hp and heals for that amount."
		},
		{
			title: "BURNING",
			class: "type-fire",
			body:  StatusBurning.description
		},
		{
			title: "SHIELD",
			class: "type-shield",
			body:  StatusShield.description
		},
		{
			title: "FIRE STANCE",
			class: "type-fire",
			body:  StatusFireStance.description
		},
		{
			title: "SPREAD",
			class: "type-spread",
			body:  "Copy a status to targets within a 2 tile radius."
		},
		{
			title: "POWERFUL",
			class: "type-powerful",
			body:  "Spell gains double the benefit of spell power."
		},
		{
			title: "EMPOWERED",
			class: "type-powerful",
			body:  "Gain 1 spellpower per stack until end of turn."
		},
		{
			title: "FLARE",
			class: "type-fire",
			body:  "Deal damage equal to target BURNING stacks."
		},
		{
			title: "REKINDLE",
			class: "type-fire",
			body:  "Adds BURNING equal to the highest BURNING the monster has ever had."
		},
		{
			title: "TEMPERED",
			class: "type-fire",
			body:  "Reduces damage taken by 1 per stack."
		},
		{
			title: "EXHAUST",
			class: "exhaust",
			body: "Goes into your Exhaust pile until the next combat."
		},
		{
			title: "EPHEMERAL",
			class: "ephemeral",
			body: "This card will EXHAUST if not played."
		},
		{
			title: "EPIPHANY",
			class: "type-epiphany",
			body: "Your next spell costs 1 less per stack."
		}
	],
	getContent: function(keyword){
		return `<h3 class="tooltip-highlight ${keyword.class}">${keyword.title}</h3>${keyword.body}`;
	},
	replaceKeywords: (id, description) => {
		tooltips.keywords.forEach(keyword => description = description.replaceAll(keyword.title,
			`<span class="tooltip-highlight ${keyword.class}"
				onmouseout="tooltips.hideAllTooltips()"
				onmouseover="tooltips.showOnCard(
					${id},
					'${keyword.title}'
				)">
				${keyword.title}</span>`
		));

		return description;
	}
}