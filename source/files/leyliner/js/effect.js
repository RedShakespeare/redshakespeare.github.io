//animation effect
class Effect extends Drawable{
	constructor(sprite, x, y){
		super(
			[
				sprite,
				sprite+16
			],
			x,
			y
		);

		game.animationEffects.push(this);

		this.sprite.animationSpeed =  .2;

		this.ttl = 500;
	}

	//return true if this should be deleted
	update(delta){
		this.ttl -= delta*(1000/60);
		return this.ttl <= 0;
	}

	getContainer(){
		return effectsContainer;
	}
}