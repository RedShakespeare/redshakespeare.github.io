monster.json
	required props:
		* name
		* description
		* sprite: sprite number in spritesheet
		* level: determines floor placement
		* hp: max hp before fudging
		* damage: attack damage
	optional props:
		* range: attack range (default: 1)
		* onHitStatus: status name applied on hit 
		* attackSpeed: how many times a monster attacks (default 1)
		* moveSpeed: how many tiles to move (default 1)
		* turnEnders: object specifying which actions end a turn (can't combine with other actions)
			default:
			{
				move: true,
				attack: true
			}
		* properties
			examples
				ghostly: move and attack through walls
				spellImmune: can only be dealt damage through attacks