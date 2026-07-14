#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "bcgi.h"

#define MAXCOMMANDLINE 8192

main()
{
    char *p, *buf, commandline[MAXCOMMANDLINE], mchar;
    char tmp[200];
    int plev,i=0;
    char *arg[12];

    printf("Content-Type: text/html\n\n");fflush(stdout);

    if (strcmp(get_request_method(), "POST")) {
        printf("monsearch: REQUEST_METHOD must be POST!\n");
        exit(1);
    }

    printf("<html><head><title>Monster memory search results</title></head>\n");
    printf("<body><h1>Monster memory search results</h1>\n<hr>\n<p>\n");

    if ((buf=malloc(get_content_length()+1)) == NULL) {
        printf("Error: cannot allocate space for buffer<p></body></html>");
        exit(1);
    }

    strcpy(commandline, "/home/beej71/beej.us/moria/monsearch/monsearch ");
    get_pdata(buf, get_content_length()+1);

    p = getvar(buf, "mchar");

    if (p != NULL && *p != '\0') {
        strcpy(tmp,p);
        escape(tmp);
        sprintf(commandline+strlen(commandline), " %s",tmp);
    } else {
        sprintf(commandline+strlen(commandline), " \\*", p);
	}

    p = getvar(buf, "plev");
    if (p != NULL && *p != '\0') {
        strcpy(tmp,p);
        escape(tmp);
        sprintf(commandline+strlen(commandline), " %s", tmp);
    }

	printf("<pre>\n");
    fflush(stdout);
	dup2(1,2);
    system(commandline);
    fflush(stdout);
	printf("</pre>\n");

    printf("<hr></body></html>");
}

