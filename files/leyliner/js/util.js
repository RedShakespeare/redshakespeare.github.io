util = {
	getDirectionName: function(numericDirection){
		switch(numericDirection){
			case 0:
				return "EAST";
			case 1:
				return "SOUTH";
			case 2:
				return "WEST";
			case 3:
				return "NORTH";
		}
	},
	removeFromArray: function(arr, obj){
		for(let i=0;i<arr.length;i++){
			if(arr[i] == obj){
				return arr.splice(i,1);
			}
		}
	},
	leftPad:function(number,width){
		number+="";
		while(number.length<width){
			number=" "+number;
		}
		return number;
	},
	arraySwap: function(arr, aIndex, bIndex){
		const temp = arr[aIndex];
		arr[aIndex] = arr[bIndex];
		arr[bIndex] = temp;
	},
	deepCopy: function(obj){
		return JSON.parse(JSON.stringify(obj));
	},
	distance:function(x1,y1,x2,y2){
		return Math.pow(Math.pow(x2-x1,2)+Math.pow(y2-y1,2),.5);
	},
	tileDistance:function(tileA,tileB){
		return util.distance(tileA.x,tileA.y,tileB.x,tileB.y);
	},
	capitalize: function(s){
		return s[0].toUpperCase() + s.substring(1).toLowerCase();
	},
	kebabCase: function(s){
		return s.toLowerCase().split(" ").join("-");
	},
	random: function(){
		return ROT.RNG.getUniform();
	},
	randomRange: function(min, max){
	    return Math.floor(util.random()*(max-min+1))+min;
	},
	pickRandom: function(array){
		return array[util.randomRange(0,array.length-1)];
	},
	clamp: function(min, max, value){
		return Math.min(max, Math.max(min, value));
	},
	tryTo: function(description, callback){
	    for(let timeout=1000;timeout>0;timeout--){
	        if(callback()){
	            return;
	        }
	    }
	    throw 'Timeout while trying to '+description;
	},
	animations: new Map(),
	deleteAnimations: function(obj){
		util.animations.delete(obj);
	},
	resetAnimations: function(){
		util.animations.clear();
	},
	/* 
		options:
			decay
			fixedDelta
			postAnimateHandler: (obj, newValue)=>{}
	*/
	defaultAnimationDecay: 0.9,
	fadeInOut: function(selector, duration){
		const fadeDuration = 300;
		const element = document.querySelector(selector);
		element.style.opacity = 0;
		util.animate(element.style, "opacity", 1);
		setTimeout(()=>util.animate(element.style, "opacity", 0), duration + fadeDuration);
	},
	animate: function(obj, prop, target, options){
		//no need to set up an animation if the target is already met

		//the next line is broken????

		//if(parseFloat(obj[prop]) != target || !util.animationExists(obj, prop)){
			let decay = util.defaultAnimationDecay;
			let fixedDelta = false;
			let delay = 0;
			let postAnimateHandler = ()=>{};
			if(options){
				if(options.decay != undefined) decay = options.decay;
				if(options.delay) delay = options.delay;
				if(options.fixedDelta) fixedDelta = true;
				if(options.postAnimateHandler) postAnimateHandler = options.postAnimateHandler;
			}

			if(!util.animations.get(obj)){
				util.animations.set(obj, {});
			}

			if(target == 111){
				game.consoleLog("obj[prop] "+obj[prop]);
			}

			util.animations.get(obj)[prop] = {
				target,
				decay,
				fixedDelta,
				postAnimateHandler,
				delay
			};
		//}
	},
	animationExists: function(obj, prop){
		if(!util.animations){
			return false;
		}
		if(util.animations.get(obj) == undefined){
			return false;
		}
		if(util.animations.get(obj)[prop] == undefined){
			return false;
		}

		return true;
	},
	processAnimations: function(delta){
		for (const [obj, props] of util.animations) {
			Object.keys(props).forEach(prop=>{
				const anim = util.animations.get(obj)[prop];
				const target = anim.target;
				if(anim.fixedDelta){
					delta = 1;
				}
				if(anim.delay > 0){
					anim.delay -= delta * 17;
				}else{
					const decay = anim.decay ** delta;

					//const oldValue = util.getDescendantProp(prop);


					const hasPx = typeof obj[prop] == 'string' && obj[prop].match("px");
					const hasDeg = typeof obj[prop] == 'string' && obj[prop].match("deg");	
					let oldValue = parseFloat(obj[prop]);
					if(hasDeg){
						oldValue = parseFloat(
							obj[prop].replace("rotate(","").replace("deg)","")
						);
					}

					let newValue;

					const snapThreshold = 0.00001;

					if(Math.abs(oldValue-target) <snapThreshold){
						newValue = target;
						//we've met our target, delete!
						delete util.animations.get(obj)[prop];
					}else{
						newValue = target + (oldValue-target)*decay;
					}
					//util.setDescendantProp(prop, newValue);

					if(hasPx) newValue += "px";
					if(hasDeg) newValue = "rotate("+newValue+"deg)";

					obj[prop] = newValue;

					anim.postAnimateHandler(obj, newValue);
				}
			});

			//all props finished animating
			if(Object.keys(util.animations.get(obj)).length == 0){
				util.animations.delete(obj);
			}
		}
	},
	pluralize:function(thing, count){
		if(count==1){
			return count+" "+thing;
		}else{
			return count+" "+thing+"s";
		}
	},
	ajax: function(url, callback){
		//'config/monsters.json' URL
		let httpRequest = new XMLHttpRequest();

		httpRequest.onreadystatechange = ()=>{
			if (httpRequest.readyState === XMLHttpRequest.DONE) {
			  if (httpRequest.status === 200) {
			    callback(httpRequest.responseText);
			  } else {
			    game.consoleLog("problem calling: "+url);
			  }
			};
		};
		httpRequest.open('GET', url);
		httpRequest.send();
	},
	randomString: function(length){
		let s = "";
		for(let i=0;i<length;i++){
			s += String.fromCharCode(util.mathRandomRandRange(65,90));
		}
		return s;
	},
	//uses Math.random to prevent interference with RNG
	mathRandomRandRange:function(min,max){
		return Math.floor(Math.random()*(max-min+1))+min;
	},
	setSeed: function(str){
		const seedNumber = Math.abs(util.sha256Integer(str));
		ROT.RNG.setSeed(seedNumber);
	},
	sha256Integer:function(text){
		var md = forge.md.sha256.create();
		md.update(text);
		return md.digest().getInt32();
	},
	shuffle(arr){
	    let temp, r;
	    for (let i = 1; i < arr.length; i++) {
	        r = util.randomRange(0,i);
	        temp = arr[i];
	        arr[i] = arr[r];
	        arr[r] = temp;
	    }
	    return arr;
	},
	//handler should return true if line can continue
	bresenhams:function(tileA, tileB, handler){
		let x0 = tileA.x;
		let y0 = tileA.y;
		let x1 = tileB.x;
		let y1 = tileB.y;

		var orig  = {
			x0: x0,
			y0: y0,
			x1: x1,
			y1: y1
		}

		var tmp;
		var steep = Math.abs(y1-y0) > Math.abs(x1-x0);
		if(steep){
			//swap x0,y0
			tmp=x0; x0=y0; y0=tmp;
			//swap x1,y1
			tmp=x1; x1=y1; y1=tmp;
		}

		var sign = 1;
		if(x0>x1){
			sign = -1;
			x0 *= -1;
			x1 *= -1;
		}
		var dx = x1-x0;
		var dy = Math.abs(y1-y0);
		var err = ((dx/2));
		var ystep = y0 < y1 ? 1:-1;
		var y = y0;

		//timeout = 0;

		for(var x=x0;x<=x1;x++){
			/*timeout++;
			if(timeout>80){
				alert('timeout');
				return;
			}*/

			if(!(steep ? handler(y,sign*x) : handler(sign*x,y))) return;
			err = (err - dy);
			if(err < 0){
				y+=ystep;
			  err+=dx;
			}
		}
	}
}