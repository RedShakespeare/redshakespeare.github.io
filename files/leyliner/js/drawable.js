class Drawable{
	constructor(spriteLocations, x, y, containerOverride){
		this.containerOverride = containerOverride;
		this.spriteLocations = spriteLocations;
		if(Number.isInteger(spriteLocations)){
			//allow single number
			this.spriteLocations = [spriteLocations];
		}
		this.x = x;
		this.y = y;
		if(map.inBounds(x,y)){
			this.initSprite();
			this.defaultTexture = this.sprite.texture;
		}

		game.drawables.push(this);
	}

	getCenteredDrawX(){
		return (this.x + .5) * scale * tileSize;
	}

	getCenteredDrawY(){
		return (this.y + .5) * scale * tileSize;
	}

	getGlobalX(){
		return this.container.x;
	}

	getGlobalY(){
		return this.container.y;
	}

	show(){
		this.sprite.visible = true;
		//util.animate(this.sprite, "alpha", 1);
	}

	hide(){
		this.sprite.visible = false;
		//util.animate(this.sprite, "alpha", 0);
	}

	updateSprite(spriteLocation){
		this.getContainer().removeChild(this.sprite);
		if(this.sprite){
			this.sprite.destroy();
		}
		this.spriteLocations = [spriteLocation];
		this.initSprite();
	}

	cleanupSprite(){
		if(this.skipCleanup){
			return;
		}

		if(this.sprite){
			this.getContainer().removeChild(this.sprite);
			this.sprite.destroy();
			this.sprite = null;
		}
	}

	getTile(){
		return map.getTile(this.x, this.y);
	}

	getContainer(){
		if(this.containerOverride){
			return this.containerOverride;
		}
		return app.stage;
	}

	addToContainer(){
		this.getContainer().addChild(this.sprite);
	}

	initSprite(){
		if(this.spriteLocations.length == 1){
			this.sprite = new PIXI.Sprite(
				draw.getTexture(this.spriteLocations[0])
			);
		}else{
			this.sprite = new PIXI.AnimatedSprite(
				this.spriteLocations.map(loc=>draw.getTexture(loc))
			);
	  		this.sprite.play();
	  		this.sprite.animationSpeed =  0.05;
		}

		this.addToContainer();

		this.updateDrawPosition();

		this.updateScale();		
	}

	updateScale(){
		this.sprite.scale = new PIXI.Point(scale, scale);
	}

	updateDrawPosition(){
		this.sprite.x = tileSize * this.x * scale;
		this.sprite.y = tileSize * this.y * scale;
	}

	changeTexture(sprite){
		this.sprite.texture = draw.getTexture(sprite);
	}

	resetTexture(){
		this.sprite.texture = this.defaultTexture;
	}

}

class Selector extends Drawable{
	constructor(spriteLocations, x, y){
		super(spriteLocations, x, y);
	}

	getContainer(){
		return selectorContainer;
	}
}