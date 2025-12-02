/*
	Implementation of Sewers/Town dungeon types for Nethack.

	If the executable file is named 'sewers' then the Sewers
	like maps will be created, if the executable file is
	named 'town' then the Town like maps will be created.

	This source-code may be freely used and redistributed,
	provided that this comment is retained, and that free
	use of any derived code is not restricted in any way.
	Copyright (c) 2012 by Janis Papanagnou

	THIS IS EXPERIMENTAL SOURCE-CODE. THERE IS NO WARRANTY
	FOR THIS SOFTWARE. USE AT OWN RISK.

	Note: This C source-code is based on C++ source-code
	Copyright (c) 1999-2012 by Janis Papanagnou
*/

#include <stdlib.h>
#include <stdio.h>
#include <string.h>


/*
	Map these dungeon feature types to the respective Nethack types.
*/
enum	DungeonFeature
{
	ROCK	= ' ',
	FLOOR	= '.',
	WATER	= '}',
	TRAP	= '^',
	BARS	= '#',
	DOWN	= '>',
	UP		= '<',
	DOOR	= 'D',
	SDOOR	= 'S'
};

/*
	Map these wall types to the respective Nethack types.
*/
enum	Walls
{
	/* In Sewers unused symbols are marked as 'x'. */
	/* Wall_{Top,Mid,Bottom}{Left,Mid,Right} */
	W_TL = '+',  W_TM = 'x',  W_TR = '+',
	W_ML = 'x',  W_MM = 'x',  W_MR = 'x',
	W_BL = '+',  W_BM = 'x',  W_BR = '+',
	/* Wall_{Horizontal,Vertical} */
	W_H = '-',   W_V = '|'
};


#define COLNO 76
#define ROWNO 21

char map[COLNO][ROWNO];


int rnd (int m)
{
	return	rand() % m;
}

int rndg (int x)
{
	if (x <= 0)
		return	0;

	return	rnd((x+1)/2+1) + rnd((x+2)/4+1) + rnd((x+4)/8+1) + rnd((x+8)/16+1);
}


void map_dump (char * title)
{
	int x, y;

	if (title)
		printf ("\n*** %s ***\n", title);
	putchar('\n');
	for (y=0; y<ROWNO; y++)
	{
		for (x=0; x<COLNO; x++)
			putchar(map[x][y]);
		putchar('\n');
	}
	putchar('\n');
}

void map_init(int town)
{
	int x, y;
	char filler = town ? FLOOR : ROCK;
	for (y=0; y<ROWNO; y++)
		for (x=0; x<COLNO; x++)
			map[x][y] = filler;
}

void map_change_point (char old_sym, char new_sym)
{
	int	x=0;
	int	y=0;
	do {
		x = rnd(COLNO);
		y = rnd(ROWNO);
	}
	while (map[x][y] != old_sym);

	map[x][y] = new_sym;
}

void map_set_point (int x, int y, char sym)
{
	map[x][y] = sym;
}

void map_fill (int xLeft, int xRight, int yUp, int yDown, char symbol)
{
	int x, y;
	for (y=yUp; y<=yDown; y++)
		for (x=xLeft; x<=xRight; x++)
			map[x][y] = symbol;
}

void map_fillV (int x, int yUp, int yDown, char symbol, int town)
{
	int y;
	for (y=yUp; y<=yDown; y++)
		map[x][y] = symbol;
	if (town) {
		int dy = yDown-yUp+1;
		int z = rnd(3-(dy<4));
		while (z--)
			map[x][yUp+rnd(dy)] = rnd(2) ? DOOR : SDOOR;
	}
}

void map_fillH (int xLeft, int xRight, int y, char symbol, int town)
{
	int x;
	for (x=xLeft; x<=xRight; x++)
		map[x][y] = symbol;
	if (town) {
		int dx = xRight-xLeft+1;
		int z = rnd(3-(dx<6));
		while (z--)
			map[xLeft+rnd(dx)][y] = rnd(2) ? DOOR : SDOOR;
	}
}

void map_cutV (int xLeft, int xRight, int yUp, int yDown, int town)
{
	map_fillV(xLeft,   yUp+1, yDown-1,  W_V,  town);
	map_set_point(xLeft, yUp,   W_TR);
	map_set_point(xLeft, yDown, W_BR);
	map_fillV(xRight,  yUp+1, yDown-1,  W_V,  town);
	map_set_point(xRight, yUp,   W_TL);
	map_set_point(xRight, yDown, W_BL);
}

void map_cutH (int xLeft, int xRight, int yUp, int yDown, int town)
{
	map_fillH(xLeft+1, xRight-1,  yUp,    W_H,  town);
	map_set_point(xLeft,  yUp, W_BL);
	map_set_point(xRight, yUp, W_BR);
	map_fillH(xLeft+1, xRight-1,  yDown,  W_H,  town);
	map_set_point(xLeft,  yDown, W_TL);
	map_set_point(xRight, yDown, W_TR);
}

void map_init_frame (void)
{
	map_fillV(0,          0, ROWNO-1,  W_V,  0);
	map_fillV(COLNO-1,    0, ROWNO-1,  W_V,  0);
	map_fillH(0, COLNO-1, 0,           W_H,  0);
	map_fillH(0, COLNO-1, ROWNO-1,     W_H,  0);
	map_set_point(0,       0,       W_TL);
	map_set_point(0,       ROWNO-1, W_BL);
	map_set_point(COLNO-1, 0,       W_TR);
	map_set_point(COLNO-1, ROWNO-1, W_BR);
}

void map_close_border (int town)
{
	int x, y;

	for (y=0; y<ROWNO; y+=ROWNO-1)
		for (x=1; x<COLNO-1; x++)
			if ((map[x][y] == FLOOR || map[x][y] == WATER) && !town)
				map[x][y] = BARS;

	for (x=0; x<COLNO; x+=COLNO-1)
		for (y=1; y<ROWNO-1; y++)
			if ((map[x][y] == FLOOR || map[x][y] == WATER) && !town)
				map[x][y] = BARS;
}


#define BASEBLOCKSIZE	3
#define BASECUTLIMIT	(2*BASEBLOCKSIZE)
#define WCUTLIMIT		(BASECUTLIMIT+4)
#define HCUTLIMIT		(BASECUTLIMIT+3)

/* forward declaration for the recursive functions */
void map_cut_block_V (int x0, int y0, int w, int h, int level, int town);
void map_cut_block_H (int x0, int y0, int w, int h, int level, int town);


char dryOrWet (int level)
{
	/* 33% water probability */
	return	(rnd(level) == 0  ||  rnd(3) != 0) ? FLOOR : WATER;
}

void map_cut_block (int x0, int y0, int w, int h, int town)
{
	/* To make more appealing sewers, in case that  COLNO > ROWNO ,
	   the first cut is always a vertical cut. */
	map_cut_block_V(x0, y0, w, h, 1, town);
}

void map_cut_block_V (int x0, int y0, int w, int h, int level, int town)
{
	if (level <= 2  || (w >= WCUTLIMIT  &&  rnd(w-WCUTLIMIT+1) != 0))
	{
		int	wMid = rnd(w)/20+1;
		int	xMid = rndg(w-BASECUTLIMIT-wMid) + BASEBLOCKSIZE;

		int	yUp    = y0;
		int	yDown  = y0+h-1;

		map_cutV(x0+xMid-1, x0+xMid+wMid, yUp, yDown, town);
		map_fill(x0+xMid, x0+xMid+wMid-1, yUp, yDown, FLOOR);
		if (!town && dryOrWet(level) != FLOOR)
		{
			int	ww = rnd(wMid)+1;
			int	dx = rnd(wMid-ww+1);
			int	wx0 = x0+xMid+dx;
			map_fill(wx0, wx0+ww-1, yUp, yDown, WATER);
		}

		map_cut_block_H(x0, y0, xMid, h, level+1, town);
		map_cut_block_H(x0+xMid+wMid, y0, w-xMid-wMid, h, level+1, town);
	}
}

void map_cut_block_H (int x0, int y0, int w, int h, int level, int town)
{
	if (level <= 2  || (h >= HCUTLIMIT  &&  rnd(h-HCUTLIMIT+1) != 0))
	{
		int	hMid = rnd(h)/12+1;
		int	yMid = rndg(h-BASECUTLIMIT-hMid) + BASEBLOCKSIZE;

		int	xLeft  = x0;
		int	xRight = x0+w-1;

		map_cutH(xLeft, xRight, y0+yMid-1, y0+yMid+hMid, town);
		map_fill(xLeft, xRight, y0+yMid, y0+yMid+hMid-1, FLOOR);
		if (!town && dryOrWet(level) != FLOOR)
		{
			int	wh = rnd(hMid)+1;
			int	dy = rnd(hMid-wh+1);
			int	wy0 = y0+yMid+dy;
			map_fill(xLeft, xRight, wy0, wy0+wh-1, WATER);
		}

		map_cut_block_V(x0, y0, w, yMid, level+1, town);
		map_cut_block_V(x0, y0+yMid+hMid, w, h-yMid-hMid, level+1, town);
	}
}

/*
	Sample main program. Call the program with differing numbers as
	argument for the random number generator to create different
	maps.
*/
int main (int argc, char * argv[])
{
	int town = !strcmp(argv[0], "town");
	int	seedInit = (argc > 1) ? atoi(argv[1]) : 1;
	srand(seedInit);

	map_init(town);
	map_init_frame();
	map_cut_block(0, 0, COLNO, ROWNO, town);
	map_close_border(town);
	/*
		Place different types of stairs, depending on town or sewers;
		sewers: ladders, town: stairs.

		One variant can be; place multiple up/down-ladders in the sewers.
		Another variant can be; place only up-ladders in the sewers, and
		reach the next level solely through holes and trap doors.
	*/
	map_change_point(FLOOR, UP);
	map_change_point(FLOOR, DOWN);
	/*
		Place different types of traps, depending on town or sewers.
		Sewers: bear, dart, hole, rock, pit, polymorph, rust, sleeping gas,
		        statue, trap door, web
		Town: arrow, magic, pit, squeaky board, statue, trap door
	*/
	if (town || !town) { /* to be differenciated by trap types later */
		int trap;
		int ntraps = town ? 12 : 6;
		for (trap = 1; trap <= ntraps; trap++)
			map_change_point(FLOOR, TRAP);
	}

	map_dump(0);

	return	0;
}

/*
	vim: ts=4 sw=4
*/
