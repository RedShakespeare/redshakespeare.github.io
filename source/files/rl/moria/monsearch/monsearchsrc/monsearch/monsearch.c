#include <stdio.h>
#include "config.h"
#include "constant.h"
#include "types.h"
#include "externs.h"

player_type py;

int main(int argc, char **argv)
{
	void parse_cl(int argc, char **argv, char *creature, int *level, int *html);
	int i, found=0, html;
	char creature;

	parse_cl(argc, argv, &creature, (int*)(&py.misc.lev), &html);
	
	wizard = 1;

	for(i = MAX_CREATURES-1; i >= 0; i--) {
		if (creature == '*' || c_list[i].cchar == creature) {
			if (found) {
				putchar('\n');
			}
			roff_recall(i);
			found = 1;
		}
	}

	if (!found) {
		fprintf(stderr, "monsearch: unknown creature '%c'\n", creature);
		return 1;
	}

	return 0;
}

int inkey(void) { return 0; }

void prt(char *s, int r, int c)
{
	printf("%s\n", s);
}

void parse_cl(int argc, char **argv, char *creature, int *level, int *html)
{
	void usage(void);
	int i;
	*creature = '\0';
	*level = 0;

	for(i = 1; i < argc; i++) {
		if (!strcmp(argv[i], "-h") || !strcmp(argv[i], "-html")) {
			*html = 1;
		}
		
		else if (*creature == '\0') {
			*creature = argv[i][0];
		}

		else if (*level == 0) {
			*level = atoi(argv[i]);
			if (*level < 1 || *level > 40) {
				fprintf(stderr, "monsearch: level must be in the range 1-40\n");
				exit(1);
			}
		}

		else {
			usage();
		}
	}

	if (*creature == '\0' || *level == 0) {
		usage();
	}
}

void usage(void)
{
	fprintf(stderr, "usage: monsearch [-h] creature level\n");
	exit(1);
}
