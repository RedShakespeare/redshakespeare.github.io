colors = {};

/* how to add a new color:

	0) create mana sprite in ss.png
	1) add mana class in mana.js
	2) add color configuration here
	3) add color variable and 4 corresponding css stylings to style.css

*/

initColors = function(){
	colors = {
		PHYSICAL: {
			manaSprite: 32
		},
		FIRE: {
			manaSprite: 33,
			manaClass: FireMana,
			prod: true,
			description: "Powers FIRE cards. Special: consumed during AOE spells to expand the effect (mana cost not included)."
		},
		MOON: {
			manaSprite: 34,
			manaClass: MoonMana,
			prod: true,
			description: "Powers MOON cards. Special: on placement, adjacent enemies become ILLUMINATED."
		},
		ELEC: {
			manaSprite: 35,
			manaClass: ElecMana,
			prod: true,
			description: "Powers ELECTRICITY cards. Special: attracted towards the player at turn end."
		},
		BLOOD: {
			manaSprite: 36,
			manaClass: BloodMana,
			prod: true,
			description: "Powers BLOOD cards. Special: on placement, adjacent allies heal 2hp."
		},
		EARTH: {
			manaSprite: 37,
			manaClass: EarthMana
		},
		REBIRTH: {
			manaSprite: 38,
			manaClass: RebirthMana
		},
		DECAY: {
			manaSprite: 39,
			manaClass: DecayMana
		},
		CHAOS: {
			manaSprite: 40,
			manaClass: ChaosMana
		},
		FROST: {
			manaSprite: 41,
			manaClass: FrostMana
		},
	}
}