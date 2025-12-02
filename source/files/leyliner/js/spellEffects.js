spellEffects = { 
    statusList:{
        StatusBurning,
        StatusShocked,
        StatusAlly,
        StatusBerserk,
        StatusBoss,
        StatusEclipsed,
        StatusIlluminated,
        StatusStormed,
        StatusScent,
        StatusEpiphany,
        StatusVigor,
        StatusTempered,
        StatusFireImmunity,
        StatusStasis,
        StatusShield,
        StatusFireStance,
        StatusEmpowered,
        StatusBolstered,
        StatusVengeful,
        StatusSlowDeath,
        StatusOverDraw,
        StatusDragonspawn,
        StatusPhoenixspawn
    },
    init: function(){
        
    },
    damage: function(p){
        if(p.targetTile.monster){
            const amount = spellEffects.calculateDamage(p);
            
            p.targetTile.monster.damage(
                amount,
                p.spellType,
                /* source= */{tile:p.originTile, type: "spell"}
            );
        }
        game.addEffect(p.spellType, p.targetTile);
    },
    die: function(p){
        if(p.targetTile.monster){
            p.targetTile.monster.die();
        }
    },
    calculateDamage: function(p){
        let amount = p.amount;

        if(p.cost == -1 && p.totalManaConsumed){
            amount *= p.totalManaConsumed;
        }

        if(p.caster && p.caster.isPlayer){
            amount += gear.getSpellDamageBonus();
            if(spells.spellHasEffect(p.spell, "powerful")){
                amount += gear.getSpellDamageBonus();
            }
            if(spells.spellHasEffect(p.spell, "chromaBeam")){
                amount += spells.chromaBonus;
            }
            if(spells.checkForFirestarters() && p.spell.targeting=="AOE"){
                amount += spells.bonusFireConsumed*5*spells.checkForFirestarters();
                console.log("firestarter bonus!" +spells.bonusFireConsumed*5 );
            }
        }

        return amount;
    },

    freeMove: function(){
        player.tryMove(
            map.selectedTile.x - player.tile.x,
            map.selectedTile.y - player.tile.y
        );
    },

    engage: function(p){
        if(p.targetTile.monster && p.targetTile.monster.ally){
            const enemyTile = p.targetTile.monster.getEnemies().map(m=>m.tile).sort(
                (a,b)=>p.targetTile.distance(a) - p.targetTile.distance(b)
            )[0];

            if(enemyTile){
                p.targetTile.monster.teleportNearTile(enemyTile);
            }
        }
    },

    heal: function(p){
        if(p.targetTile.monster){
            let minionHeal = p.amount;
            let playerHeal = 1;
            
            if(p.cost === -1){
                minionHeal *= p.totalManaConsumed;
                playerHeal *= p.totalManaConsumed;
            }

            if(p.targetTile.monster.ally){
                p.targetTile.monster.heal(minionHeal, p.spellType);
            }else if(p.targetTile.monster.isPlayer){
                p.targetTile.monster.heal(playerHeal, p.spellType);
            }
        }

        game.addEffect(p.spellType, p.targetTile);
    },

    summon: function(p){
        if(p.targetTile.monster || !p.targetTile.passable || p.targetTile.mana){
            p.targetTile = map.getClosestEmptyTile(p.targetTile);
        }
        if(p.targetTile){
            // TODO: consider renaming amount
            let monsterName = p.amount;
            const summonedMonster = p.targetTile.createMonster(monsterName);

            // assiociate minion(s) with card that summoned it
            cards.currentCard.minions.push(summonedMonster);

            if(p.caster.isPlayer){
                summonedMonster.ally = true;
                summonedMonster.addStatus(StatusAlly);
            }
        }
    },

    //this effect adds scent status to the furthest away enemy from the leyliner.  Should not reassign already existing scent.
    bloodScent: function(p){
        let enemies = game.getEnemies();
        let alreadyScented = enemies.filter(s =>!s.dead && s.hasStatus(StatusScent));
        if(alreadyScented.length){
            return;
        }
        let furthest = p.caster.getFurthestTarget(enemies);
        if(furthest){
            furthest.addStatus(StatusScent);
        }
        return;
    
    },

    //Used to manually target a scent.  Will overwrite existing scents.
    targetScent: function(p){
        if(p.targetTile.monster && !p.targetTile.monster.ally){
            let enemies = game.getEnemies();
            let alreadyScented = enemies.filter(s =>s.hasStatus(StatusScent));
            if(alreadyScented.length){
                alreadyScented[0].removeStatus(StatusScent);
            }
            p.targetTile.monster.addStatus(StatusScent);
            return;
        }
        
    
    },

    knockback: function(p){
        //TODO: This code was never implemented -- overlaps with gravity?
    },

    lunge: function(p){
        p.caster.move(map.getClosestEmptyTile(p.targetTile));
    },

    lunairetic: function(p){
        if(p.targetTile.monster){
            if(!(p.targetTile.monster.isPlayer || p.targetTile.monster.ally)){
                if(p.targetTile.monster.hasStatus(StatusIlluminated)){
                    p.targetTile.monster.getStatus(StatusIlluminated).level *=2;
                }
                p.targetTile.monster.damage(
                    p.amount,
                    p.spellType,
                    /* source= */
                    {tile:p.originTile, type: "spell"}
                );
            }
            
        }

        game.addEffect(p.spellType, p.targetTile);
    },

    // move AND/OR attack
    command: function(p){
        if(p.targetTile.monster?.ally){
            const monster = p.targetTile.monster;

           monster.performActions(
                {
                    move: 1,
                    attack: 1
                },
                {
                    move: false,
                    attack: true
                }
            );
        }
    },

    engorge: function(p){
        if(p.targetTile.monster?.ally){
            for(let i=0; i<p.amount; i++){
                p.targetTile.monster.maxHp = p.targetTile.monster.maxHp +10;
                p.targetTile.monster.heal(10,"BLOOD");
            }
        }
    },

    gravity: function(p){
        if(p.targetTile.monster){
            if(!p.monstersAffected.has(p.targetTile.monster)){
                p.monstersAffected.add(p.targetTile.monster);
                p.targetTile.monster.teleportNearTile(map.selectedTile);
            }
        }
    },

    teleportCaster: function(p){
        if(!p.monstersAffected.has(p.caster)){
            p.monstersAffected.add(p.caster);
            p.caster.teleportNearTile(map.selectedTile);
        }

    },

    chromaEngine: function(p){
        const typesInHand = cards.getUniqueTypesInHand();
        typesInHand.forEach(cards.drawOneCard);
    },

    chromaOven: function(p){
        const typesInHand = cards.getUniqueTypesInHand();
        typesInHand.forEach(()=>spellEffects.generateRandomMana(p));
    },

    chromaBeam: function(p){
        const typesInHand = cards.getUniqueTypesInHand();
        spells.chromaBonus =typesInHand.size*p.amount;
        console.log("beam", typesInHand.size, p.amount, spells.chromaBonus);
    },

    chromaField: function(p){
        const typesInHand = cards.getUniqueTypesInHand();
        let shieldValue =(typesInHand.size)*p.amount + gear.getSpellDamageBonus();

        const status = p.targetTile.monster.addStatusByName("Shield", shieldValue);

        if(p.direction != undefined){
            status.setDirection(p.direction);
        }
    },

    phase: function(p){
        //place the two most expensive cards on the bottom of the deck.
        //TODO: Un-link phase from draw but needs to preserve draw as many as phased functionality in some form.
        let sortedHand = cards.hand.concat().sort((a,b)=>{
            return a.spell.cost-b.spell.cost;
        }).filter(s=>s!=cards.currentCard);

        sortedHand.forEach(h=>console.log(h.spell.name));
        
        console.log("p.amount = " + p.amount);
        for(let i=0; i<p.amount; i++){
            if(sortedHand.length > 0){
                let phasedCard = sortedHand.pop();
                util.removeFromArray(cards.hand, phasedCard);
                cards.deck.unshift(phasedCard);
                cards.drawOneCard();
            }   
        }
    },

    stoke: function(p){
        if(p.targetTile.monster){
            const existingStatus = p.targetTile.monster.getStatus(StatusBurning);
            if(existingStatus){
                game.addEffect("FIRE", p.targetTile);
                existingStatus.level *= 4;
                existingStatus.ttl = existingStatus.duration;
            }
        }
    },

    chainLightning: function(p){
        spells.drawEffectsBetween(p.originTile, p.targetTile, "ELEC");
    
        let newEffects = util.deepCopy(p.allEffects);
        const chainEffect = newEffects.find(e=>e.chainLightning != undefined);
        if(chainEffect.chainLightning <= 0){
            return;
        }else{
            chainEffect.chainLightning--;
            console.log(newEffects)
        }


        spells.previousTargets.push(p.targetTile);

        if(p.targetTile){
            const originalTarget = p.targetTile;
            
            let closestTargetMonster = p.targetTile.getNearestMonster(spells.previousTargets);

            if(closestTargetMonster){
                let closestTarget = closestTargetMonster.tile;

                if(closestTarget.monster){
                    let dist = util.tileDistance(closestTarget, p.targetTile);
                    if(dist <= 2.5){
                        p.targetTile = closestTarget;

                        game.addEvent(
                            spells.effectsProcessor,
                            [{
                                caster: originalTarget.monster,
                                targets: closestTarget,
                                effects: newEffects,
                                spellType: "ELEC",
                                totalManaConsumed: 0,
                                cost: 0,
                                originTile: originalTarget,
                                spell: p.spell
                            }],
                            150,
                            /* scope= */ undefined,
                            /* priority= */ 0
                        );
                    }
                }
            }
            
            
        }
    },

    status: function(p){
        if(p.targetTile.monster){
            let statusName = p.amount.type;

            // a little ugly but oh well
            // TODO: just do sound based on card type
            if(statusName == "Illuminated"){
                if(p.targetTile.monster.isPlayer || p.targetTile.monster.ally){
                    statusName = "Eclipsed";
                }
                main.playSound("damageMOON");
            }

            let times = spellEffects.calculateStatusStacks(p);

            
            const status = p.targetTile.monster.addStatusByName(statusName, times);

            console.log("p.direction",p.direction)
            if(p.direction != undefined){
                status.setDirection(p.direction);
            }
        }
    },

    calculateStatusStacks: function(p){
        let statusName = p.amount.type;
        let times = p.amount.stacks;

        const status = spellEffects.statusList['Status'+statusName];

        if(p.cost === -1 && status.canStack){
            times *= p.totalManaConsumed;
        }
        if(statusName == "Shield"){
            times += gear.getSpellDamageBonus();
        }
        return times;
    },

    spreadStatus: function(p){
        if(p.targetTile.monster){
            //TODO: Move statusConstructor code to a util bc it is repeated and likely to be more repeated
            const statusConstructor = spellEffects.statusList['Status'+p.amount.status];
            if(p.targetTile.monster.hasStatus(statusConstructor)){
                let spreadStacks = p.targetTile.monster.getStatus(statusConstructor).level;
                let spreadTiles = p.targetTile.getRadiusTiles(p.amount.radius);

                spreadTiles.filter(t=>t!=p.targetTile)
                    .filter(t=>t.monster)
                    .forEach(t=>t.monster.addStatus(statusConstructor, spreadStacks));
                
            }

        }
    },

    aoeFlare: function(p){
        if(p.targetTile.monster){
            //TODO: Move statusConstructor code to a util bc it is repeated and likely to be more repeated
            let aoeTiles = p.targetTile.getRadiusTiles(p.amount.radius);

            aoeTiles.filter(t=>t!=p.targetTile)
                .filter(t=>t.monster)
                .forEach(t=>{
                    t.monster.damage(
                        t.monster.getStatus(StatusBurning).level,
                        "FIRE",
                        /* source= */ {tile:p.originTile, type: "spell"}
                    );
                });
                
                
        }
    },

    purify: function(p){
        if(p.targetTile.monster){
            let monst = p.targetTile.monster;
            for(let k=monst.statuses.length-1;k>=0;k--){
                const status = monst.statuses[k];

                if(status){
                    if(status.monster){
                        if(status.monster.dead){
                            console.log("trying to purify a dead monster");
                        }else if(status.dispellable){
                            status.destroy();
                            monst.statuses.splice(k,1);
                        }
                    }
                }else{
                    game.consoleLog("UNDEFINED STATUS: "+monst.getName()+" k:"+k + " length:"+monst.statuses.length);
                }
            }
        }
    },

    powerful: function(p){
        spells.powerfulBonus = gear.getSpellDamageBonus();
    },

    invoke: function(p){
        console.log("invoking at: ",p.targetTile.xy(), !!p.targetTile.mana)
        p.targetTile.createMana(p.spellType);
        //spellEffects.generateRandomMana(p);
    },

    obliterate: function(p){
        if(p.targetTile.monster){
            p.targetTile.monster.die();
        }
    },

    sacrifice: function(p){
        player.subtractHp(p.amount);
    },

    //used to dynamically find out how much bolster to add:  adds stacks based on total damage dealt.
    bolster:function(p){
        console.log(p);
        const times = spells.totalDamage;
        console.log("times = " + times);
        player.addStatus(StatusBolstered, times);
    },

    draw: function(p){
        cards.drawOneCard();
    },


    dormant: function(p){
        for(let i=0; i< p.amount; i++){

            //TODO: genericize this using colors.js mapping ELEC => ELECTRICITY
            //      and util.capitalize()
            cards.createCardInHand("Dormant Electricity");
        }
    },

    moonWalk: function(p){
        /*for(let i=0; i< p.amount; i++){
            cards.createCardInHand("Step");
        }*/
        cards.createCardInHand("One");
        cards.createCardInHand("Giant");
        cards.createCardInHand("Leap");
    },

    firstborn: function(p){
        if(p.spell.name){
            if(p.spell.name === "Firstborn Sin"){
                cards.createCardInHand("Firstborn Lust");
            }else if(p.spell.name === "Firstborn Lust"){
                cards.createCardInHand("Firstborn Gluttony");
            }else if(p.spell.name === "Firstborn Gluttony"){
                cards.createCardInHand("Firstborn Greed");
            }else if(p.spell.name === "Firstborn Greed"){
                cards.createCardInHand("Firstborn Sloth");
            }else if(p.spell.name === "Firstborn Sloth"){
                cards.createCardInHand("Firstborn Envy");
            }else if(p.spell.name === "Firstborn Envy"){
                cards.createCardInHand("Firstborn Wrath");
            }else if(p.spell.name === "Firstborn Wrath"){
                cards.createCardInHand("Firstborn Pride");
            }else if(p.spell.name === "Firstborn Pride"){
                cards.createCardInHand("Firstborn Pride");
            }
        }
        
    },

    generateRandomManaAroundMonster: function(p){
        spellEffects.generateRandomMana(p, true)
    },

    generateRandomMana: function(p, mustTargetMonster){
        if(mustTargetMonster && 
        (!p.targetTile?.monster ||p.targetTile?.monster?.isPlayer)){
            return;
        }

        let tile;
        if(p.targetTile && (p.targetTile.monster || p.manaOnDeath)){
            tile = p.targetTile;
        }else if(p.caster == player){
            tile = player.tile;
        }else{
            throw("Invalid generateRandomMana params");
        }

        //generate mana randomly around target location, must be empty tile.
        for(let i=0; i<p.amount; i++){
            let randomTile = map.getAllTiles()
                        .filter(y=>y.passable && !y.monster && !y.mana)
                        .sort((a,b)=>{
                            return tile.distance(a)-tile.distance(b);
                        })[0];
            if(randomTile){
                randomTile.createMana(p.spellType);
            }else{
                game.consoleLog("no room to place mana randomly");
            }
        }
    },

    generateContinuousMana: function(p){
        let tile;
        if(p.targetTile?.monster){
            tile = p.targetTile;
        }else if(p.caster == player){
            tile = player.tile;
        }else{
            throw("Invalid generateRandomMana params");
        }

        const tilesSeen = [];

        // get all groups (each group starting from a neighbor)
        // sort within groups by distance
        // sort groups by length descending
        // iterate through groups, generate mana until done
        const groups = util.shuffle(tile.getAllNeighbors()).map(n=>{
            const group = n.getConnectedTiles(t=>
                cards.canPlaceMana(t) &&
                t!=tile && 
                tile.distance(t)<2 && 
                !tilesSeen.includes(t)
            ).sort((a,b)=>n.distance(a)-n.distance(b));

            group.forEach(t=>tilesSeen.push(t));

            return group;
        }).sort((a,b)=>b.length-a.length);

        console.log(groups);

        let manaToGenerate = p.amount;
        for(let i=0;i<groups.length;i++){
            const group = groups[i];

            if(!group.length){
                continue;
            }

            let frontier = [group[0]];
            while(manaToGenerate && frontier.length){
                const manaTile = frontier.shift();
                console.log("manaToGenerate",manaToGenerate, manaTile.xy())
                manaTile.createMana(p.spellType);
                manaToGenerate--;
                frontier = frontier.concat(
                    manaTile.getAdjacentNeighbors()
                        .filter(t=>cards.canPlaceMana(t) && tile.distance(t)<2)
                );
            }
        }
    },

    overcharge: function(p){
        spells.overcharge++;
    },

    rekindle: function(p){
        if(p.targetTile.monster){
            let rekindleFormat = p;
            rekindleFormat.amount={};
            rekindleFormat.amount.type = "Burning";
            rekindleFormat.amount.stacks = p.targetTile.monster.maxBurnStacks;
            
            console.log(rekindleFormat);
            spellEffects.status(rekindleFormat);
        }
        
        return;
    },

    flare: function(p){
        if(p.targetTile.monster){
            let targetMonster = p.targetTile.monster
            if(targetMonster.hasStatus(StatusBurning)){
                console.log(targetMonster.getStatus(StatusBurning).level);
                targetMonster.damage(
                    targetMonster.getStatus(StatusBurning).level,
                    "FIRE",
                    /* source= */ {tile:p.originTile, type: "spell"}
                );
            }
            
            
            //spellEffects.status(rekindleFormat);
        }
        
        return;
    },

    closestHealthiestSpreadStatus: function(p){
        if(p.targetTile.monster){

            let closestHealthiestMonsterTile = p.targetTile.getHealthiestMonsterTile(p.amount.radius);
            //TODO: copy burning stacks from target to closest using p.amount.status.type to genericize it.
        }
    },

    
}