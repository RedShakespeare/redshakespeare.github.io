all: monsearch

monsearch: monsearch.o recall.o monsters.o variable.o
	cc -o monsearch monsearch.o recall.o monsters.o variable.o

monsearch.o: monsearch.c config.h constant.h externs.h types.h
	cc -c monsearch.c

monsters.o: monsters.c config.h constant.h externs.h types.h
	cc -c monsters.c

recall.o: recall.c config.h constant.h externs.h types.h
	cc -c recall.c

variable.o: variable.c config.h constant.h externs.h types.h
	cc -c variable.c

