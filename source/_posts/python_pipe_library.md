---
title: Python 第三方库 pipe 详细介绍
date: 2026-01-22 23:22:25
tags:
  - 教程
  - Python
  - Manual
  - 技术分享
  - pipe
---
## 背景
《重构：改善现有代码的设计》第二版将循环语句也列入代码坏味道中，并提出应当使用“以管道代替循环”的重构方法进行重构，但是 Python 中并没有内置简单易用的管道特性，built-in 的`map`和`filter`写起来难以理解且费时费力，反而增加了代码修改的成本。搜索发现 JulienPalard 开发的第三方库`pipe`可以很优雅地解决这个问题。

## 简单介绍 - 从《重构》中的原示例开始
```python
# 原示例是类似 JS 的伪代码，这里用 python 重写
name  = []
for i in inputs:
    if i.job == "programmer":
        name.append(i.name)

# 管道实现
from pipe import select, where
name = list(inputs 
        | where(lambda i: i.job == "programmer")
        | select(lambda i:i.name))
```

`pipe` 提供了一系列内置的管道方法实现，允许用户使用 `|` 运算符将管道方法连接在可迭代对象后，实现对可迭代对象中元素的批量处理。由于处理后的返回值也是迭代器，原迭代对象后可以连接一系列管道方法。`pipe` 也允许用户创建自定义的管道方法。

## 安装
```shell
python3 -m pip install pipe
```

## 用法
### 基础用法
用户可以调用管道方法处理可迭代对象，返回迭代器。
```python
from pipe import select
nums = [1, 2, 3, 4]
nums_square = list(nums | select(lambda x: x * x))
print(nums_square)
# [1, 4, 9, 16]
```
有的管道方法无需传入参数，这时也可以省略管道方法后的小括号。
```python
from pipe import traverse
nested_list = [1, [2, [3]], 4]
# 两种写法都可以
flattened_list = list(nested_list | traverse())
flattened_list = list(nested_list | traverse)
```
### 嵌套
管道方法的返回值也是迭代器，因此可以连接一系列管道方法，实现复杂的连续处理。这也是管道取代循环的主要方式。

仍然以《重构》中的原示例为例：我们有一个office.csv文件，存储了各个办公室的一些数据。
```txt
office, country, telephone
Chicago, USA, +1 312 373 1000
Beijing, China, +86 4008 900 505
Bangalore, India, +91 80 4064 9570
Porto Alegre, Brazil, +55 51 3079 3550
Chennai, India, +91 44 660 44766

... (more data follows)
```
现在需要将所有印度（India）的办公室筛选出来，并返回办公室所在的城市（city）和电话号码（phone）。

循环实现如下：
```python
def acquireData(csv):
    lines = csv.split("\n")
    first_line = True
    result = []
    for line in lines:
        if first_line:
            first_line = False
            continue
        if line.strip() == "":
            continue
        record = line.split(",")
        if record[1].strip() == "India":
            result.append({"city": record[0].strip(),
                           "phone": record[2].strip()})
    return result
```
使用管道方法`skip`、`select`和`where`，我们可以很方便地实现另一种写法：
```python
from pipe import skip, select, where

def acquireData(csv):
    lines = csv.split("\n")
    return list(skip(1)
            | where(lambda line: line.strip() != "")
            | select(lambda line: line.split(","))
            | where(lambda record: record[1].strip() == "India")
            | select(lambda record: {"city": record[0].strip(), 
                                    "phone": record[2].strip()}))
```
### 常用内置管道方法介绍
#### `select(func)`/ `map(func)`
对可迭代对象的每个元素执行`func`函数，执行结果组成新的迭代器。
```python
from pipe import select
nums = [1, 2, 3, 4]
nums_square = list(nums | select(lambda x: x * x))
print(nums_square)
# [1, 4, 9, 16]
```

#### `where(func)`/`filter(func)`
对可迭代对象的每个元素执行`func`函数，若执行结果可被视为`True`则选取该结果组成新的迭代器。
```python
from pipe import where
nums = [1, 2, 3, 4]
nums_odd = list(nums | where(lambda x: x % 2))
print(nums_odd)
# [1, 3]
```

#### `take(n)`, `skip(n)`, `tail(n)`
这三个方法都对传入的迭代器进行切片。`take(n)`取迭代器的前`n`个元素，`tail(n)`取迭代器的后`n`个元素，而`skip(n)`丢弃迭代器的前`n`个元素。
```python
from pipe import take, skip, tail
nums = [1, 2, 3, 4]
print(list(nums | take(1)))
# [1]
print(list(nums | skip(1)))
# [2, 3, 4]
print(list(nums | tail(2)))
# [3, 4]
```
#### `take_while(predicate)`, `skip_while(predicate)`
与上文类似，但这两个方法会根据`predicate`处理的结果来取或跳过元素，遇到第一个结果为`False`的元素即停止计算。
```python
from pipe import take_while, skip_while
nums = [1, 2, 3, 4]
print(list(nums | take_while(lambda x: x < 4)))
# [1, 2, 3]
print(list(nums | skip_while(lambda x: x < 4)))
# [4]
```

#### `t(element)`, `chain`, `chain_with(iterable)`, `traverse`
这几个方法可以把元素或迭代器连接或展开为新的迭代器。

`t`类似 Haskell 语言中的`:`运算符，可以将单个元素连接为迭代器；

`chain`可以将元素全部为迭代器的迭代器依次连接起来， 而`chain_with`可以将迭代器与作为参数传入的其他迭代器相连；

`traverse`可以把复杂嵌套的迭代器递归展开成单层。
```python
from pipe import t, chain, chain_with, traverse
print(list(1 | t(2) | t(3)))
# [1, 2, 3]
print(list([[1],[2, 3], [4]] | chain))
# [1, 2, 3, 4]
print(list([1] | chain_with([2, 3],[4])))
# [1, 2, 3, 4]
print(list[1, [2, [3, 4]], [5]] | traverse)
# [1, 2, 3, 4, 5]
```
#### `dedup(func=None)`, `uniq(func=None)`
这两个方法都可以对迭代器元素去重, 区别在于`dedup`会对整个迭代器全局去重，只保留第一个，而`uniq`只去除相邻重复元素。当传入`func`函数时，两者都会先计算元素被`func`处理后的结果，再基于结果判断是否重复。
```python
from pipe import dedup, uniq
nums = [1, 1, 2, 3, 3, 2, 2, 2, 1]
print(list(nums | dedup))
# [1, 2, 3]
print(list(nums | uniq))
# [1, 2, 3, 2, 1]
nums_2 = [1, -1, -2, 2]
print(list(nums_2 | dedup(abs)))
# [1, -2]
```

其他内置函数可以在[官方文档](https://github.com/JulienPalard/Pipe/blob/main/README.md)查看。

### 自定义管道方法
`pipe`允许用户使用`Pipe`类简单地创建自定义管道方法。

#### 简单实现
`Pipe`类构造函数接受首个参数为迭代器的函数作为参数，将该函数转换为管道方法形式。参数函数可以是自己定义或其他库定义好的，也可以是 lambda 表达式。
```python
from pipe import Pipe
from collections import deque
square = Pipe(lambda iterable: (x * x for x in iterable))
deque_ = Pipe(deque)
```
#### 装饰器实现
对复杂一些的原函数，`pipe`库还支持使用装饰器的形式构造管道方法，仍然要求原函数的首个参数是迭代器。
```python
from pipe import Pipe
@Pipe
def running_average(iterable, width):
    items = deque(maxlen=width)
    for item in iterable:
        items.append(item)
        yield mean(items)

list(range(20) | running_average(width=10))
# [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]
```
## 高级应用
### 偏管道
管道方法可以有多个传入参数。当一个管道方法的部分参数没有被赋值时，它可以被视为只有这些未赋值的传入参数的新管道。
```python
# 以下几个管道方法严格等价
some_pipe(1, 2, 3)
some_pipe(1, 2)(3)
some_pipe(1)(2)(3)
```
应用这个特性，我们可以借助现有的通用管道方法创建一些更特殊的方法。
```python
>>> import re
>>> @Pipe
... def grep(iterable, pattern, flags=0):
...     for line in iterable:
...         if re.match(pattern, line, flags=flags):
...             yield line
...
>>> lines = ["Hello", "hello", "World", "world"]
>>> for line in lines | grep("H"):
...     print(line)
Hello
>>> lowercase_only = grep("[a-z]+$")
>>> for line in lines | lowercase_only:
...     print(line)
hello
world
>>> igrep = grep(flags=re.IGNORECASE)
>>> for line in lines | igrep("hello"):
...    print(line)
...
Hello
hello
```
### 懒加载
`pipe`的管道方法都是懒加载的，只有在结果迭代器被实际消费时才会开始进行管道方法的运算。这意味着用户可以安全地传入一些无限迭代器（如`count()`），只要使用`take`之类的方法截断就不必担心过大的迭代器拖慢运行效率。

### 收尾函数
早期版本的`pipe`库提供了一些用于计算收尾的管道方法，如`add`（计算迭代器的累加和）和`list`（将迭代器转为`list`格式），但从 2.0 版本开始作者弃用并移除了这些方法。用户可以改用`sum()`和`list()`等内置函数来进行方便的收尾，也可以自行实现收尾方法（通常非常简单）。一些已被弃用的收尾方法实现可以在[这里](https://github.com/JulienPalard/Pipe/blob/dd179c8ff0aa28ee0524f3247e5cb1c51347cba6/pipe.py)找到。
