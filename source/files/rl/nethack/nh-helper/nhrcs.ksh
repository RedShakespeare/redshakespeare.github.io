#!/usr/bin/ksh
#
# NHRCS - Nethack Random Character Selector (Shell Version 1.1)
# 
# Usage:  nhrcs  base-selection-set  [selections... | options...]
#
# Base selection set:
#   ALL    Start with all possible character combination; restrict
#          the selection set by subsequent '-' selections.
#   NONE   Start with an empty set of character combinations, add
#          to the selection set by subsequent '+' selections.
#   BASE=filename
#          Start the selection set using the character combinations
#          defined in the given file; you may build your own list
#          from the data produced by this program running with the
#          options "ALL list" or any subset by specifying selections.
#
# Selections:
#   +|- class, +|- race, +|- alignment, +|- gender
#          You may specify a sequence of these selections to be added
#          (+) or removed (-) from the base selection set. You may
#          define compound (class-race-alignment-gender) selections
#          (or subsets) by joining the selections with a dash. Missing
#          components in the middle must be specified by a '*', as in
#          +arc-*-*-fem.
#
# Options:
#   All these options may be specified in the ressource file.
#
#   name=charactername   Specify the name of your character.
#   show      Display the command as it would be executed.
#   exec      Launch Nethack with a random selection from your set.
#   confirm   Launch Nethack with that selection after confirmation.
#   list      Display a list of all possible selections in your set.
#
#
# Examples:
#   nhrcs ALL list
#     list all combinations of class, race, alignment, and gender,
#     which are allowed by Nethack
#
#   nhrcs NONE +wiz list
#     list all combinations for the wizard class which are allowed
#     by Nethack
#
#   nhrcs NONE +ran +wiz -hum
#     just non-human rangers or wizards
# 
#   nhrcs NONE +hum
#     just humans
# 
#   nhrcs ALL -rog -mal
#     all but rogues or males
# 
#   nhrcs ALL -wiz-elf -wiz-orc
#     all but elven or orcish wizards
# 
#   nhrcs NONE +rog +wiz +wiz +wiz
#     just rogues and wizards, biased towards wizards
# 
#   Note: You may specify Kornshell's regular expressions in your
#   selection:
# 
#   nhrcs NONE +ran-@(gno|orc)-*-mal
#     just male gnomish or orcish rangers of any alignment
# 
#   Note: If you specify compound selections, like 'tou-hum-neu-mal',
#   or 'hum-neu', make sure that the sequence of selectors is in the
#   correct order and contiguous.
#   
#   Note: The charater selection set is build incrementally, so the
#   order of single selections is significant, swapping may change the
#   result. This is helpful to include otherwise excluded character
#   types. Example:
#
#       nhrcs NONE +ran +wiz +pri -hum
#
#   will select all rangers, wizards, and priests, but never humans;
#
#       nhrcs NONE +ran +wiz -hum +pri
#
#   will select all rangers and wizards that are non-human, and also
#   priests, even human ones.
# 
# Files
#   .nhrcsrc may contain options which are considered if they are not
#   overwritten by options specified on the command line.
# 
#   Note: If you want to also specify the base selection set as the
#   first line in the ressource file use this call syntax to achieve
#   it:
#       nhrcs $(< ~/.nhrcsrc)
# 
# Known bugs:
#   Wrong wording for a female caveman (cavewoman) and a female priest
#   (priestess).
# 
# Janis Papanagnou                                          2005-01-29


typeset progname=${0##*/}

function usage
{
	cat <<- EOT

	Usage: ${progname}  { ALL | NONE | BASE=filename }  [ selections... ]
	selections:
	  [+|-][arc|bar|cav|hea|kni|mon|pri|ran|rog|sam|tou|val|wiz]
	  [+|-][dwa|elf|gno|hum|orc]
	  [+|-][cha|law|neu]
	  [+|-][fem|mal]
	  [ name=charactername ]
	  [ show | confirm | exec | list ]

	EOT
}

function ignore_arg
{
	print -u2 - "Unexpected selection ignored: '${1}'"
}

function add_to_set
{
	typeset -n the_set=$1
	typeset    the_value=$2

	the_set=(${the_set[@]} ${the_value})
}

function remove_from_set
{
	typeset -n the_set=$1
	typeset    the_value=$2

	tmp_set="${the_set[@]}"
	the_set=(${tmp_set/${the_value}/})
}

function show_header
{
	cat <<- EOT 1>&2

	  @@@@---------------------------------------------------------@@@@
	  @@@   Nethack Random Character Selector (Shell Version) 1.0   @@@
	  @@@@---------------------------------------------------------@@@@

	EOT
}

[[ $# == 0 || $1 == "-?" ]]  &&  usage  &&  exit 0

show_header

typeset -A map=( 
# classes
	[arc]=archeologist [bar]=barbarian [cav]=caveman [hea]=healer
	[kni]=knight [mon]=monk [pri]=priest [ran]=ranger [rog]=rogue
	[sam]=samurai [tou]=tourist [val]=valkyrie [wiz]=wizard
	# We don't care about the female forms; cavewoman, priestess.
# races
	[dwa]=dwarven [elf]=elven [gno]=gnomish [hum]=human [orc]=orcish
# alignment
	[cha]=chaotic [law]=lawful [neu]=neutral
# gender
	[fem]=female [mal]=male
)

typeset -A none_set

typeset all_set=( 
	arc-{hum,dwa,gno}-{law,neu}-{mal,fem} 
	bar-{hum,orc}-{neu,cha}-{mal,fem} 
	cav-{hum,dwa,gno}-{law,neu}-{mal,fem} 
	hea-{hum,gno}-neu-{mal,fem} 
	kni-hum-law-{mal,fem} 
	mon-hum-{law,neu,cha}-{mal,fem} 
	pri-{hum,elf}-{law,neu,cha}-{mal,fem} 
	ran-{hum,elf,gno,orc}-{neu,cha}-{mal,fem} 
	rog-{hum,orc}-cha-{mal,fem} 
	sam-hum-law-{mal,fem} 
	tou-hum-neu-{mal,fem} 
	val-{hum,dwa}-{law,neu}-fem 
	wiz-{hum,elf,gno,orc}-{neu,cha}-{mal,fem} 
)

case ${1:?} in
ALL)	selection=( ${all_set[@]} ) ;;
NONE)	selection=( ${none_set[@]} ) ;;
BASE=*)	selection=( $(< "${1#*=}") ) ;;
# Alternatively depending on first selection.
# Note: perform *no* shift in this case!
#+*)		selection=( ${none_set[@]} ) ;;
#-*)		selection=( ${all_set[@]} ) ;;
*)		usage  &&  exit 1 ;;
esac
shift 1

typeset show_command=1
typeset mode=confirm

typeset rc_file=${HOME}/.${progname}rc
touch "${rc_file}"

# read config file, but restrict to the options (ignore selections)
set -- $(grep -E '(list|show|confirm|exec|name=)' "${rc_file}") "$@"
#printf "%s\n" "DEBUG:" "$@" "------"

# build selection set from selection arguments
for arg in "$@"
do
	case "${arg}" in
	+*)
		arg="${arg#?}"
		for sel in "${all_set[@]}"
		do
			[[ "${sel}" == *${arg}* ]]  &&  add_to_set selection "${sel}"
		done
		;;
	-*)
		arg="${arg#?}"
		for sel in "${selection[@]}"
		do
			[[ "${sel}" == *${arg}* ]]  &&  remove_from_set selection "${sel}"
		done
		;;
	name=*)
		user=${arg#name=}
		;;
	show)
		show_command=1
		;;
	confirm|exec|list)
		mode="${arg}"
		;;
	*)	ignore_arg "${arg}"
		;;
	esac
done

# remove illegal combinations (currently non-chaotic elves)
for sel in "${selection[@]}"
do
#	[[ "${sel}" == *-elf-law-* ||
#	   "${sel}" == *-elf-neu-* ]]  &&  remove_from_set selection "${sel}"

	case "${sel}" in
		*-elf-law-*|*-elf-neu-*|*-dwa-neu-*|*-dwa-cha-*|*-gno-law-*|*-gno-cha-*|*-orc-law-*|*-orc-neu-*)
			remove_from_set selection "${sel}";;
	esac
done

# prepare the selection set for further processing (list all, or random select)
set -- ${selection[@]}

[[ ${mode} == "list" ]]  &&  printf "%s\n" "${@:-<none>}" | sort  &&  exit 0

[[ $# == 0 ]]  &&  print -u2 - "Error: empty selection set!"  &&  exit 1

# randomly select one entry from the selection set
eval character="\${$(( RANDOM % $# + 1 ))}"

# inform about the selected character
IFS="-" read role race alignment gender <<< "${character}"
cat <<- EOT
	You are a ${map[$alignment]} ${map[$gender]} ${map[$race]} ${map[$role]}.

EOT

# if yet undefined user name, ask for it, or use system default otherwise
[[ -z ${user} ]]  &&  read user?"Enter your name: "
: ${user_character:=${user:-$(id -un)}-${character}}

(( show_command ))  &&  cat <<- EOT
	Command is: nethack -u "${user_character}"

EOT

case ${mode} in
confirm)
	read yn?"Type <enter> to execute this command, <ctrl>-D to abort."  &&
		exec nethack -u "${user_character}"
	;;
exec)
	exec nethack -u "${user_character}"
	;;
esac


exit 0

# vim: ts=4 sw=4
