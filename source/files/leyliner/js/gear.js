class Gear{
    constructor(name, powerLevel){
        //this.consumeConfig();


        this.name = name;
        this.displayName = "+"+ powerLevel + " " + this.name;
        this.powerLevel = powerLevel;

        this.element = this.render();

        this.affixes = [];
    }

    getElement(){
        return this.element;
    }

    consumeConfig(){
        // deprecated, I think
        return;

        this.config = main.gearClassMap[this.constructor.name];
        this.name = this.config.name;
        this.description = this.config.description;
        this.slot = this.config.slot;
    }

    equip(){
        const previousSlotItem = gear.paperDoll[this.slot];

        gear.paperDoll[this.slot] = this;

        this.affixes.forEach(a=>a.equipEffect(previousSlotItem));
    }

    //AFFIXES
    getSpellDamageBonus(){
        return this.getAffixBonus("SPELL_DAMAGE");
    }

    getBumpDamageBonus(){
        return this.getAffixBonus("BUMP_DAMAGE");
    }

    getDamageReductionBonus(){
        return this.getAffixBonus("DAMAGE_REDUCTION");
    }

    getHealthBonus(){
        return this.getAffixBonus("HEALTH");
    }

    getAffixBonus(type){
        let bonus = 0;
        this.affixes.forEach(a => {
            if(a.type == type){
                bonus += a.getTotalValue();
            }
        });
        return bonus;
    }

    getAffixDescriptions(){
        const descriptions = [];
        const spellDamageBonus = this.getSpellDamageBonus();
        const bumpDamageBonus = this.getBumpDamageBonus();
        const damageReductionBonus = this.getDamageReductionBonus();
        const healthBonus = this.getHealthBonus();

        //if(this.getSpellDamageBonus()) descriptions += 
        return descriptions;
    }

    render(){
        const element = document.createElement('div');
        element.className = 'gear-slot-item ' + this.getCssClass();
        return element;
    }

    getHtml(){
        return `<div
            class="gear-slot-item ${this.getCssClass()}"
        ></div>`;
    }

    getCssClass(){
        return "gear-"+util.kebabCase(this.name);
    }
}

class GearDamageHelm extends Gear{

}

class GearDamageChest extends Gear{

}

class GearDamageShoulders extends Gear{

}

class GearDamageHands extends Gear{

}

class GearDamageLegs extends Gear{

}

class GearDamageFeet extends Gear{

}

class GearDamageLeft extends Gear{

}

class GearDamageRight extends Gear{

}

class GearDamageRing extends Gear{

}

class GearDamageFamiliar extends Gear{

}

class Affix{
    constructor(level, type){
        this.level = level;
        this.type = type;
        this.baseValue = 1;
    }

    getTotalValue(){
        return this.level * this.baseValue;
    }

    getEffectName(){
        return this.effectName;
    }

    getDescription(){
        return "+"+this.getTotalValue()+" "+this.getEffectName();
    }

    equipEffect(){
        // most gear does nothing special on equip
    }
}

class AffixSpellDamage extends Affix{
    constructor(level){
        super(level, "SPELL_DAMAGE");
        this.effectName = "Spell Power";
    }
}

class AffixBumpDamage extends Affix{
    constructor(level){
        super(level, "BUMP_DAMAGE");
        this.effectName = "Attack Damage";
    }
}

class AffixHealth extends Affix{
    constructor(level){
        super(level, "HEALTH");
        this.baseValue = 5;
        this.effectName = "Health";
    }

    equipEffect(previousSlotItem){
        let currentSlotBonus = 0;
        if(previousSlotItem){
            currentSlotBonus = previousSlotItem.getAffixBonus("HEALTH");
        }

        let thisBonus = this.getTotalValue();

        if(thisBonus > currentSlotBonus){
            player.heal(
                thisBonus - currentSlotBonus,
                /* healType= */ null
            );
        }
    }
}

class AffixDamageReduction extends Affix{
    constructor(level){
        super(level, "DAMAGE_REDUCTION");
        this.effectName = "Damage Reduction";
    }
}

/*
    items probably won't have affixes on them?

    so it probably doesn't make sense to put them in json?

    affix object?
*/


//head: Helmets, circlets, witch hats, wizard hats, diadems, hoods
//chest: robes, vestments, ceremonial gowns, magician's coat
//shoulders: capes, cloaks, pauldrons
//hands: gloves, gauntlets, bracers?
//legs: Greaves, Pantaloons, shorts
//feet: Shoes, clogs, boots, 
//weapon: Staves, Poppets, Axes, Swords, Hammers, Mixing Alembics, Torches
gear = { 
    slotTypes: {
        head: {
            // x/y in 64px tile increments, y axis is assumed centered
            x: 0,
            y: 0,
            // TODO: rework this, possibly to have various types
            gearName: "Helm",
            affixTypes: [
                AffixHealth
            ]
        },
        chest: {
            x: 0,
            y: 2,
            gearName: "Plate",
            affixTypes: [
                AffixHealth
            ]
        },
        shoulders: {
            x: -1,
            y: 1,
            gearName: "Pauldron",
            affixTypes: [
                AffixDamageReduction
            ]
        },
        familiar: {
            x: 1,
            y: 1,
            gearName: "Bird",
            affixTypes: [
                AffixSpellDamage
            ]
        },
        left: {
            x: -2,
            y: 3,
            gearName: "Sword",
            affixTypes: [
                AffixBumpDamage
            ]
        },
        right: {
            x: 2,
            y: 3,
            gearName: "Staff",
            affixTypes: [
                AffixBumpDamage
            ]
        },
        hands: {
            x: -2,
            y: 4,
            gearName: "Gauntlets",
            affixTypes: [
                AffixSpellDamage
            ]
        },
        ring: {
            x: 2,
            y: 4,
            gearName: "Ring",
            affixTypes: [
                AffixSpellDamage
            ]
        },
        legs: {
            x: 0,
            y: 5,
            gearName: "Leggings",
            affixTypes: [
                AffixHealth
            ]
        },
        feet: {
            x: 0,
            y: 7,
            gearName: "Boots",
            affixTypes: [
                AffixDamageReduction
            ]
        }
    },

    pickGearPowerLevel: function(floor){
        let level = Math.ceil(floor/3);

        let chanceToCrap = 0;
        let chanceToBump = 0;
        const remainder = (floor-1) % 3;
        if(remainder == 0){
            chanceToCrap = 0.4;
            chanceToBump = 0.1;
        }else if(remainder == 1){
            chanceToCrap = 0.2;
            chanceToBump = 0.2;
        }else if(remainder == 2){
            chanceToCrap = 0.1;
            chanceToBump = 0.4;
        }

        if(util.random() < chanceToCrap){
            level--;
        }
        if(util.random() < chanceToBump){
            level++;
        }

        return util.clamp(1,3, level);
    },

    getSlotPowerLevel: function(slot){
        const item = gear.paperDoll[slot];
        if(!item){
            return 0;
        }else{
            return item.powerLevel;
        }
    },

    generateGear: function(floor){
        if(!floor){
            floor = 1;
        }


        const slot = util.shuffle(Object.keys(gear.slotTypes)).sort((a,b)=>{
            return gear.getSlotPowerLevel(a) - gear.getSlotPowerLevel(b);
        })[0];


        // TODO: more complicated logic for power level
        let powerLevel = Math.max(
            gear.pickGearPowerLevel(floor),
            // AT LEAST ONE HIGHER THAN CURRENT POWER
            gear.getSlotPowerLevel(slot) + 1
        );

        const slotConfig = gear.slotTypes[slot];
        const name = slotConfig.gearName;
        const newGear = new Gear(name, powerLevel);


        newGear.slot = slot;
        newGear.description = "";


        //PICK AFFIX (ONE FOR NOW)
        const affixType = util.pickRandom(slotConfig.affixTypes);

        newGear.affixes.push(new affixType(powerLevel));

        return newGear;
        /*
            TODO:
            x    -pick random slot
            T    -constrain slot by existing gear
            x    -pick an affix level (based on passed in floor?)
            x    -create new Gear()
            X    -fix name
                -generate affixes (1 for now) based on level
                -fix css

        */
    },

    paperDoll:{},

    printPaperDoll: function(){
        console.log("****** GEAR ******");
        gear.iterateEquipped(item => console.log(item.slot, item));
        console.log("******************");
    },

    getSpellDamageBonus: function(){
        let bonus = 0;
        gear.iterateEquipped(item => bonus+=item.getSpellDamageBonus());
        if(player.hasStatus(StatusEmpowered)){
            bonus += player.getStatus(StatusEmpowered).level;
        }
        return bonus;
    },
    getBumpDamageBonus(){
        let bonus = 0;
        gear.iterateEquipped(item => bonus+=item.getBumpDamageBonus());
        return bonus;
    },
    getDamageReductionBonus(){
        let bonus = 0;
        gear.iterateEquipped(item => bonus+=item.getDamageReductionBonus());
        return bonus;
    },
    getHealthBonus(){
        let bonus = 0;
        gear.iterateEquipped(item => bonus+=item.getHealthBonus());
        return bonus;
    },


    init: function(){
        gear.paperDoll = {};
        // new GearDamageHelm().equip();
        // new GearDamageShoulders().equip();
        // new GearDamageFamiliar().equip();
        // new GearDamageChest().equip();
        // new GearDamageLegs().equip();
        // new GearDamageLeft().equip();
        // new GearDamageRight().equip();
        // new GearDamageHands().equip();
        // new GearDamageRing().equip();
        // new GearDamageFeet().equip();
    },


    displayChestPickup: function(item){
        const c = gear.getSlotDescriptionComponents(item.slot);

        const content = `<div id="chest-pickup-container">
            <div id="chest-pickup-description">
                ${c.description}

                <div id="chest-image-container">
                    ${item.getHtml()}
                </div>
            </div>
        </div>`;
        
        menu.showMenu({
            type: 'CHEST',
            title: c.name,
            content: content,
            event: event,
            menuSize: 'small',
            extraMenuClass: 'glowing-description',
            clickToClose: true,
        });
    },

    closeChestPickup: function(){
        document.querySelector("#chest-pickup-description").style.display = "none";

        cards.goBackToState();
        // SPAWNED ON CHEST
        if(cards.state == "POSITION"){

        }
        if(event){
            event.preventDefault();
            event.stopPropagation();
        }
    },

    mouseEnterHandler: function(slot){
        document.querySelector("#inventory-description").innerHTML = gear.getSlotFullDescription(slot);
        document.querySelector("#inventory-description").style.display = "inline-block";
    },

    mouseOutHandler: function(){
        document.querySelector("#inventory-description").innerHTML = "";
        document.querySelector("#inventory-description").style.display = "none";
    },

    openInventory: function(event){
        if(menu.getCurrentType() == "INVENTORY"){
            menu.closeMenu();
        }else{

            let content =
                `<div id="inventory-container">
                    <div id="paper-doll-container">
                        <img src="img/paperdoll.png">
                        <div id="paper-doll-container-inner">`;

            gear.iterateSlots((slot, item) => {
                content += gear.getHtml(slot);
            });

            content += 
                        `</div>
                    </div>
                    <div id="inventory-description-container">
                        <div id="inventory-description" class="gear-description"></div>
                    </div>
                </div>`;

            menu.showMenu({
                type: 'INVENTORY',
                title: 'Equipment',
                content: content,
                event: event,
            });
        }

    },

    getSlotFullDescription: function(slot){
        const c = gear.getSlotDescriptionComponents(slot);
        return  `<h1>${c.name}</h1><div>${c.description}</div>`;
    },

    getSlotDescriptionComponents: function(slot){
        let name = "";
        let description = "";
        const item =  gear.paperDoll[slot];
        if(item){
            name = "+"  + item.powerLevel + " " + item.name.toUpperCase();
            description = item.description;
            item.affixes.forEach(a=>{
                description += `<div>${a.getDescription()}</div>`;
            });
        }else{
            name = slot.toUpperCase();
        }
        return {name, description};
    },


    getHtml: function(slot){
        const left = (gear.slotTypes[slot].x+2)*64;
        const top = (gear.slotTypes[slot].y)*64;
        const item = gear.paperDoll[slot];
        return `<div
                class="gear-slot slot-${slot}"
                style="left:${left}px;top:${top}px;"
                onmouseenter="gear.mouseEnterHandler('${slot}')" 
                onmouseout="gear.mouseOutHandler()"
            >
                ${item ? item.getHtml() : ''}
            </div>`;
    },

    // all slots, gearItem may be undefined
    iterateSlots: function(callback){
        Object.keys(gear.slotTypes).forEach(slot=>{
            const gearItem = gear.paperDoll[slot];
            callback(slot, gearItem);
        });
    },

    // only slots that have gear equipped
    iterateEquipped: function(callback){
        Object.keys(gear.slotTypes).forEach(slot=>{
            const gearItem = gear.paperDoll[slot];
            if(gearItem){
                callback(gearItem);
            }
        });
    }
    
}