spells = { 
    init: function(){
	},

    radiusSmoothingMargin: 0.5,

    getCurrentSpell: function(){
        return cards.currentCard?.spell;
    },

    descriptionHandlers: {
        damage: (spell, effect, params)=>{
            const baseDamage = effect.damage;
            let description = "";

            let basePhrase = baseDamage;
            if(spell.cost == -1){
                if(baseDamage == 1){
                    basePhrase = 'X';
                }else{
                    basePhrase = baseDamage + 'X';
                }
            }
            description += `Deals ${basePhrase} damage`;

            let totalDamage = spellEffects.calculateDamage(params);
            if(totalDamage > baseDamage){
                description += ` (<span class="highlight">${totalDamage}</span>)`;
            }
            return description;
        },
        status: (spell, effect, params)=>{
            const baseStacks = effect.status.stacks;
            const status = effect.status.type;
            const type = status.toUpperCase();
            let description = "";

            let statusConstructor = spellEffects.statusList['Status'+status];

            let basePhrase = baseStacks;
            if(spell.cost == -1 && statusConstructor.canStack){
                if(baseStacks == 1){
                    basePhrase = 'X';
                }else{
                    basePhrase = baseStacks + 'X';
                }
            }else if(baseStacks == 1){
                basePhrase = '';
            }
            description += `Applies ${basePhrase} ${type}`;

            if(spell.allyOnly || spell.summonOnly){
                if(spell.allyOnly){
                    description += " to target ALLY";
                }else if(spell.summonOnly){
                    description += " to target MINION";
                }
                if(spell.targeting == "AOE" || spell.targeting.type == "AOE"){
                    description += "S";
                }
            }

            let totalStacks = spellEffects.calculateStatusStacks(params);
            if(totalStacks > baseStacks){
                description += ` (<span class="highlight">${totalStacks}</span>)`;
            }
            return description;
        }
    },

    generateSpellDescription: function(spell, originalDescription, card){
        // not yet supported
        if(spell.endTurnEffects){
            return originalDescription;
        }

        try{
            let description = "";

            if(spell.targeting == "AOE" || spell.targeting.type == "AOE"){
                description += `In a ${spell.radius} tile radius: `;
            }

            if(spell.effects.length == 0){
                description = "Does nothing.";
            }

            for(let i=0;i<spell.effects.length;i++){
                const effect = spell.effects[i];
                const effectType = Object.keys(effect)[0];
                const handler = spells.descriptionHandlers[effectType];
                if(!handler){
                    // effect is currently unsupported for automatic generation
                    return originalDescription;
                }

                const params = {
                    spell: spell,
                    cost: spell.cost,
                    caster: player,
                    amount: effect[effectType],
                    totalManaConsumed: spells.getManaToConsume(spell.type, spell.cost).length
                };

                description += handler(spell, effect, params) + ". ";
            }

            if(spell.exhaust){
                description += "EXHAUST.";
            }

            return description;

        }catch(e){
            debug.showErrorHighlight();
            console.error("Error in spell description handler");
            return originalDescription;
        }
    },

    spellHasEffect: function(spell, effectName){
        return spell.effects.find(effect=>{
            return Object.keys(effect).map(e=>e.toLowerCase()).includes(effectName.toLowerCase());
        });
    },


    consumeMana: function(type, amount){
        if(!shouldConsumeMana){
            game.consoleLog("BYPASSING MANA CONSUMPTION");
            return true;
        }
        
        const manaGroup = spells.getManaToConsume(type, amount);
        if(manaGroup){
            manaGroup.forEach(t=>t.removeMana());
            game.consoleLog(`CONSUMED ${manaGroup.length} MANA`)

            manaGroup.forEach(t=>game.consoleLog(`CONSUMED at ${t.xy()}`));
            
            return manaGroup.length;
        }else{
            game.consoleLog("NO MANA FOUND");
            return 0;
        }
    },

    checkEpiphanyCost: function(cost){
        if(cost > 0){
            if(player.hasStatus(StatusEpiphany)){
                let EpiphanyStacks = player.getStatus(StatusEpiphany).level;
                cost = Math.max(0,cost - EpiphanyStacks);
            }
        }
        
        return cost;
    },

    //returns tiles that have mana, (does not return mana itself)
    getManaToConsume: function(type, amount){
        //free, but return empty array to support functions that expect it
        if(amount == 0 || !player || !player.tile){
            return [];
        }

        const manaGroups = player.tile
            .getAllNeighbors()
            .map(neighbor => neighbor.getConnectedTiles(t=>t.mana && t.mana.type == type))
            .filter(group=>group.length >= amount)
            .filter(group=>group.length > 0);


        //take largest for X
        if(amount == -1){
            manaGroups.sort((a,b)=>{
                if(b.length != a.length){
                    return b.length - a.length;
                }else if(a.length){
                    //break ties by min X, then minY
                    const aMinId = a.map(t=>t.mana.id).reduce((prev,current)=>Math.min(prev,current), Infinity);
                    const bMinId = b.map(t=>t.mana.id).reduce((prev,current)=>Math.min(prev,current), Infinity);

                    return aMinId - bMinId;
                }
            });
        }else{
            manaGroups.sort((a,b)=>{
                if(b.length != a.length){
                    return a.length - b.length;
                }else if(a.length){
                    //break ties by min X, then minY
                    const aMinId = a.map(t=>t.mana.id).reduce((prev,current)=>Math.min(prev,current), Infinity);
                    const bMinId = b.map(t=>t.mana.id).reduce((prev,current)=>Math.min(prev,current), Infinity);

                    return aMinId - bMinId;
                }
            });
        }
        const manaGroup = manaGroups[0];
        if(!manaGroup){
            console.log("undefined mana group")
            return [];
        }else{
            return manaGroup;
        }
    },

    getRange: function(spell){
        if(!spell){
            spell = spells.getCurrentSpell();
        }
        return spell?.range;
    },

    getTargetDistance: function(){
        return player.tile.distance(map.selectedTile);
    },

    isValidTarget: function(){
        if(cards.basicMana){
            return true;
        }else{
            const spell = spells.getCurrentSpell();
            const distance = spells.getTargetDistance();
            let losOK = true;
            if(spell.targeting == "PROJECTILE" || spell.targeting == "BEAM"){
                losOK = player.tile.hasLOS(map.selectedTile) && spells.canDrawLine(player.tile, map.selectedTile);
            }

            if(!map.selectedTile.passable){
                return false;
            }

            let valid = losOK && distance < spells.getRange() + spells.radiusSmoothingMargin;
            
            if(spell.targeting == "DIRECTIONAL" && distance == 0){
                valid = false;
            }

            game.consoleLog("is valid target? "+valid);
            return valid;
        }
    },

    canDrawLine: function(a,b, skipEnds){
        let canDraw = false;
        util.bresenhams(a, b, (x,y)=>{
            const tile = map.getTile(x,y);

            // we don't care about the start or stop tile, only the tiles in between
            if((tile == a || tile == b) && skipEnds){
                if(tile == b){
                    canDraw = true;
                }
                return true;
            }

            if(!tile.passable){
                return false;
            }
            if(tile == b){
                canDraw = true;
            }
            return true;
        });
        return canDraw;
    },

    //Checks if we are in valid range of targeted mana
    confirmTarget: function(tileX, tileY){
        cards.cleanupAnimatingMana();

        const newTile = map.getTile(tileX, tileY);
        const spell = cards.currentCard.spell;
        if(cards.basicMana){
            if(!newTile.monster && !newTile.mana && newTile.passable){
                newTile.createMana(spell.type);
                cards.confirmCardUse();
            }
        }else{
            if(spells.isValidTarget()){

                let totalManaConsumed = 0;
                let actualCost = cards.currentCard.getActualCost();
                
                if(player.hasStatus(StatusEpiphany)){
                    player.removeStatus(StatusEpiphany);
                }
                
                if(actualCost !=0){
                    totalManaConsumed=spells.consumeMana(spell.type, actualCost);
                }
                if(!totalManaConsumed && actualCost> 0){
                    //this should never happen because we already checked affordability
                    throw 'Unable to afford spell in confirmTarget';
                }else{
                    //do shit on card
                    spells.spellValidator(spell);
                    
                    try{
                        cards.changeState("PROCESSING");

                        spells.totalManaConsumed = totalManaConsumed;
                        
                        spells.charges = spells.overcharge + 1;
                        spells.overcharge = 0;

                        spells.spellProcessor();

                        if(cards.class == "TACTICIAN" && cards.starterType == cards.currentCard.spell.type
                            // && cards.currentCard.getActualCost() != 0
                        ){
                            const offColor = util.shuffle(
                                cards.hand.filter(c=>c.spell.type != cards.starterType && c.spell.cost - c.discount > 0)
                            )[0];
                            if(offColor){
                                offColor.discount++;
                            }
                        }

                    }catch(e){
                        debug.showErrorHighlight();
                        console.log(e);
                    }

                    spells.clearSpellHighlights();
                }
            }
        }
    },

    postCast: function(){
        cards.confirmCardUse();
        game.removeDeadMonsters();
        game.updateUI();
        main.updateHoverDescription();
        game.delayedAutoPickup();
    },

    clearSpellHighlights: function(){
        map.getAllTiles().forEach(t=>{
            t.unsetHighlight(["RANGE","ERROR", "EFFECT"]);
        });
    },

    chainToFireManaNeighbors: function(inputArray){
        const frontier = inputArray;
        const targetSet = new Set(frontier);

        while(frontier.length){
            const tile = frontier.pop();

            // FIRE SPREADING
            // should this apply to all spells or just fire spells?
            // leaving it for everything for now
            if(tile.mana?.type == "FIRE" && !tile.mana.willBeConsumed()){
                tile.getAllNeighbors().forEach(neighbor => {  
                    if(!targetSet.has(neighbor)){
                        targetSet.add(neighbor);
                        frontier.push(neighbor);
                    }
                })
            }
        }

        return Array.from(targetSet);
    },

    getTargetObject: function(spell){
        let targeting = spell.targeting;
        let targetObject = {};
        //TODO Clean up this after spells.json objectification pass
        if(typeof(targeting)=== "object"){
            targetObject = targeting;
        }else{
            targetObject = {
                type: targeting
            }
        }
        return targetObject;
    },

    //target is a tile
    getTargets: function(caster, spell, target, alreadyConsumedMana){
        let targetArray = [target];
        let targetObject = spells.getTargetObject(spell);

        if(targetObject.ignoreLOS == undefined) targetObject.ignoreLOS = spell.ignoreLOS;

        //TODO filter ignore self, friendlies, 

        /*
            TODO: move allyOnly into targeting config
            TODO: allow targeting to take object also (keeping string as option) with additional config

            TODO: Targeting becomes an object, contains original targeting style but adds object elements such as:
                friendlyDamage, ignoreSelf, ignoreLOS, etc.
        */


        /*
            aoe targeting order:

            current:

                1)      get aoe

                2)      chaining fire mana

                3)      remove things out of LOS
                        (but ignore chainable fire mana and neighbors)

            alternative:

                1)      get aoe

                2)      remove things out of LOS

                3)      chaining fire mana

        */

        if(targetObject.type === "AOE"){
            targetArray = target.getRadiusTiles(spell.radius);
        }else if(targetObject.type === "INVOKE"){
            const invokeTimes = spell.effects.filter(e=>e.invoke)[0].invoke;
            console.log("invokeTimes", invokeTimes)
            targetArray = map.getAllTiles()
                                // ignore mana being used to pay for spell
                                // but only do this before consuming the mana
                                .filter(t=>cards.canPlaceMana(t) || (!alreadyConsumedMana && spells.getManaToConsume(
                                    spell.type,
                                    cards.currentCard.getActualCost()
                                ).includes(t)))
                            .sort((a,b)=>{
                                return player.tile.distance(a)-player.tile.distance(b);
                            }).slice(0,invokeTimes);
            targetArray.forEach(t=>console.log("target array: "+t.xy()));
        }else if(targetObject.type === "DIRECTIONAL"){
            targetArray = player.tile.getDirectionalTiles(target);
            
        //supports legacy targeting nomenclature but combines the two
        //TODO: Jeremiah wil clean up these two into one.
        }else if(targetObject.type === "BEAM" || targetObject.type === "PROJECTILE"){
            targetArray = [];
            util.bresenhams(caster.tile, target, (x,y)=>{
                const tile = map.getTile(x,y);
                if(tile.passable){
                    if(tile != caster.tile){
                        targetArray.push(tile);
                        if(targetObject.type === "PROJECTILE"){
                            if(tile.monster){
                                return false;
                            }
                        }
                    }
                    return true;
                }else{
                    return false;
                }
            });
        }

        //TODO friendlyDamage -- will call it ignoreAllies &

        //TODO move things into a separate function to filter after visualization. SO THAT it is not in the spells processor
        // i.e. ignore self shouldn't be here
        if(targetObject.ignoreSelf){
            targetArray = targetArray.filter(c=>c!=caster.tile);
        }
        //TODO cleanup spells.json (ignoreLOS should be in targeting object --which they don't have yet)
        if(!targetObject.ignoreLOS && targetObject.type != "INVOKE"){
            targetArray = targetArray.filter(t=>t.hasLOS(target) && t.passable);
        }

        if(targetObject.type === "AOE"){
            targetArray = spells.chainToFireManaNeighbors(targetArray);
        }

        return targetArray;

    },

    // some spells need to be AOE but then have effects that only target the selected tile
    singleTargetEffects: ['spreadStatus', 'bolster', 'draw', 'sacrifice'],

    //target is a tile here
    //effects is usually an array of one effect when coming from spellProcessor
    //todo: probably should refactor args to only use spell and it's property
    effectsProcessor: function(options){
        let {caster, targets, effects, spellType, totalManaConsumed, cost, originTile, spell} = options;

        if(!Array.isArray(targets)){
            targets = [targets];
        }

        if(!originTile){
            originTile = caster.tile;
        }

        if(effects.length==1){
            const effectType = Object.keys(effects[0])[0];

            if(spells.singleTargetEffects.includes(effectType)){
                console.log("SINGLE TARGET! "+effectType);
                targets = [map.selectedTile];
            }
        }

        /*
            SEQUENTIAL ANIMATION:
                -every call to effects processor should be on a queue
                -meaning that all effects are bundled together
    
            TODO:
            x    -add event
            x    -decrement events
            x    -call events
                -fix up chain lightning draw between
                -block input

        */

        const monstersAffected = new Set();
        targets.forEach(target=>{
            for(let i=0;i<effects.length;i++){
                const currentEffect = effects[i];
                const effectType = Object.keys(currentEffect)[0];
                const effectFunction = spellEffects[effectType];
                const effectValue = currentEffect[effectType];
                let direction;
                if(spell?.targeting == "DIRECTIONAL"){
                    direction = player.tile.getDirection(map.selectedTile);
                }
                let params = {
                    targetTile: target,
                    amount: effectValue,
                    cost: cost,
                    totalManaConsumed: totalManaConsumed,
                    spellType: spellType,
                    caster: caster,
                    originTile: originTile,
                    monstersAffected: monstersAffected,
                    direction: direction,
                    // spellProcessor handles one effect at a time
                    allEffects: effects.length == 1 ? spell?.effects : effects,
                    spell: spell
                };
                if(!effectFunction){
                    console.error(`Effect type [${effectType}] is not defined in spellEffects.js`);
                }else{
                    effectFunction(params);
                }
            }
        });

        //cards.currentCard
    },

    //TODO get spell property, if missing give clean formatted error message
    spellValidator: function(spell){
        var error="";
        //#region
        if(!spell.name){
            error+= " Missing name";
        }

        if(!spell.type){
            error+= " Missing type";
        }

        if(!spell.description){
            error+= " Missing description";
        }

        if(!spell.targeting){
            error+= " Missing targeting";
        }

        if(spell.targeting == "AOE"){
            if(!spell.radius){
                error+= " Missing radius";
            }
        }

        if(spell.cost===undefined){
            error+= " Missing cost";
        }

        if(spell.range===undefined){
            error+= " Missing range";
        }

        if(!spell.effects){
            error+= " Missing effects";
        }
        
        //#endregion

        //check for errors if not go ahead with spell
        if(error!=""){
            throw("MALFORMED SPELL:" + error);
        }
    },

    checkForFirestarters: function(){
        return game.getAllies().filter(m=>m.getName()=="Firestarter Totem").length;
    },

    //function to process spells, add target to parameters?  Currently hardcoded
    spellProcessor: function(){
        const spell = spells.getCurrentSpell();
        const card = cards.currentCard;

        const totalManaConsumed = spells.totalManaConsumed;
        spells.powerfulBonus = 0;
        spells.chromaBonus=0;
        spells.totalDamage=0;
        spells.bonusFireConsumed=0;

        if(!spells.charges){
            spells.postCast();
            return;
        }else{
            spells.charges--;
        }

        card.minions = [];

        //TODO: check if json is malformed (benefit would be clarity when debugging)
        //TODO: wrap in if to warn player invalid decisions

        spells.previousTargets = [];

        //clarify if tile vs monster (I think it is tile)
        let targets = spells.getTargets(
            player,
            spell,
            map.selectedTile,
            /* alreadyConsumedMana= */ true
        );

        const originalTargets = targets.concat();
        
        //placing this here so aoe drawing still displays to user correctly
        // TODO: exclude summonOnly/enemyOnly as valid targets from single target spells
        //ALLY == you and your summons
        if(spell.allyOnly){
            targets = targets.filter(t=>t.monster?.ally || t.monster?.isPlayer);
        }
        // TODO: include "summoned" enemies, maybe?
        if(spell.summonOnly){
            targets = targets.filter(t=>t.monster?.ally !== undefined);
        }
        if(spell.enemyOnly){
            targets = targets.filter(t=>!t.monster?.ally && !t.monster?.isPlayer);
        }
        if(spell.selfOnly){
            targets = [player.tile];
        }

        //TODO: change if to if firestarters exist
        let numFirestarters = spells.checkForFirestarters();
        console.log("firestarter # = " + numFirestarters);
        if(numFirestarters){
            spells.bonusFireConsumed =0;
            originalTargets.filter(t=>{
                if(t.mana && t.mana.type == "FIRE" && spells.getTargetObject(spell).type === "AOE"){
                    spells.bonusFireConsumed++;
                }
            });
        }

        for(let j=0;j<spell.effects.length;j++){
            spells.effectsProcessor({
                caster: player,
                targets: targets,
                effects: [spell.effects[j]],
                spellType: spell.type,
                totalManaConsumed: totalManaConsumed,
                cost: spell.cost,
                spell: spell
            });
        }

        // only remove if AOE and FIRE
        originalTargets.filter(t=>{
            if(t.mana && t.mana.type == "FIRE" && spells.getTargetObject(spell).type === "AOE"){
                t.removeMana();
            }
        });
    },
    drawEffectsBetween: function(a,b, type){
        if(a && b){
            util.bresenhams(a, b, (x,y)=>{
                const tile = map.getTile(x,y);
                if(tile != a && tile != b){
                    game.addEffect(type, tile);
                }
                return true;
            });
        }
    },   
    previousTargets: [],


}

//default value 0
spells.overcharge = 0;

spells.init();