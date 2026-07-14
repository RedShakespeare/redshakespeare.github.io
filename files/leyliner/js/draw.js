draw = {
	textures: {},
	getTexture: function(location){
		return draw.createTexture('sprite', location, spritesheetTexture, tileSize);
	},
	getIconTexture: function(location){
		return draw.createTexture('icon', location, iconSpritesheetTexture, 7);
	},
	getTinyverseTexture: function(location){
		return draw.createTexture('tiny', location, tinyverseTexture, 5, 7);
	},
	createTexture: function(keyPrefix, location, spritesheet, width, height){
		if(!height) height  = width;
		
		const key = keyPrefix + '-'+location;
		if(!draw.textures[key]){
			draw.textures[key] = new PIXI.Texture(
				spritesheet,
				new PIXI.Rectangle(
					width*(location%16),
					height*Math.floor(location/16),
					width,
					height
				)
			);
		}
		return draw.textures[key];
	}
}