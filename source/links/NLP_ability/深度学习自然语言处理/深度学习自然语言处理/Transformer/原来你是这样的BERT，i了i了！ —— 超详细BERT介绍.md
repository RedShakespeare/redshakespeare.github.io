# 原来你是这样的BERT，i了i了！ —— 超详细BERT介绍（一）BERT主模型的结构及其组件

[**BERT**](https://arxiv.org/abs/1810.04805)（**B**idirectional **E**ncoder **R**epresentations from **T**ransformers）是谷歌在2018年10月推出的**深度语言表示**模型。

一经推出便席卷整个NLP领域，带来了革命性的进步。
从此，无数英雄好汉竞相投身于这场追剧（芝麻街）运动。
只听得这边G家110亿，那边M家又1750亿，真是好不热闹！

然而大家真的了解BERT的具体构造，以及使用细节吗？
本文就带大家来细品一下。

------

## **前言**

本系列文章分成三篇介绍BERT，本文主要介绍BERT主模型（BertModel）的结构及其组件相关知识，另有两篇分别介绍BERT[预训练](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html)相关和如何将BERT应用到不同的[下游任务](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html)。

文章中的一些缩写：NLP（natural language processing）自然语言处理；CV（computer vision）计算机视觉；DL（deep learning）深度学习；NLP&DL 自然语言处理和深度学习的交叉领域；CV&DL 计算机视觉和深度学习的交叉领域。

文章公式中的向量均为行向量，矩阵或张量的形状均按照PyTorch的方式描述。
向量、矩阵或张量后的括号表示其形状。

本系列文章的代码均是基于[transformers](https://github.com/huggingface/transformers)库（v2.11.0）的代码（基于Python语言、PyTorch框架）。
为便于理解，简化了原代码中不必要的部分，并保持主要功能等价。
在代码最开始的地方，需要导入以下包：

<details><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span></code></pre></details>

阅读本系列文章需要一些背景知识，包括**Word2Vec**、**LSTM**、**Transformer-Base**、**ELMo**、**GPT**等，由于本文不想过于冗长（其实是懒），以及相信来看本文的读者们也都是冲着BERT来的，所以这部分内容还请读者们自行学习。
本文假设读者们均已有相关背景知识。

------

## **目录**

- 1、主模型
  - [1.1、输入](https://www.cnblogs.com/wangzb96/p/bert_model.html#11、输入)
  - 1.2、嵌入层
    - [1.2.1、嵌入变换](https://www.cnblogs.com/wangzb96/p/bert_model.html#121、嵌入变换)
    - [1.2.2、层标准化](https://www.cnblogs.com/wangzb96/p/bert_model.html#122、层标准化)
    - [1.2.3、随机失活](https://www.cnblogs.com/wangzb96/p/bert_model.html#123、随机失活)
  - 1.3、编码器
    - 1.3.1、隐藏层
      - [1.3.1.1、线性变换](https://www.cnblogs.com/wangzb96/p/bert_model.html#1311、线性变换)
      - 1.3.1.2、激活函数
        - [1.3.1.2.1、tanh](https://www.cnblogs.com/wangzb96/p/bert_model.html#13121、tanh)
        - [1.3.1.2.2、softmax](https://www.cnblogs.com/wangzb96/p/bert_model.html#13122、softmax)
        - [1.3.1.2.3、GELU](https://www.cnblogs.com/wangzb96/p/bert_model.html#13123、gelu)
      - [1.3.1.3、多头自注意力](https://www.cnblogs.com/wangzb96/p/bert_model.html#1313、多头自注意力)
      - [1.3.1.4、跳跃连接](https://www.cnblogs.com/wangzb96/p/bert_model.html#1314、跳跃连接)
  - [1.4、池化层](https://www.cnblogs.com/wangzb96/p/bert_model.html#14、池化层)
  - [1.5、输出](https://www.cnblogs.com/wangzb96/p/bert_model.html#15、输出)

------

# [**1、主模型**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

BERT的**主模型**是BERT中最重要组件，BERT通过预训练（pre-training），具体来说，就是在主模型后再接个专门的模块计算预训练的损失（loss），预训练后就得到了主模型的参数（parameter），当应用到下游任务时，就在主模型后接个跟下游任务配套的模块，然后主模型赋上预训练的参数，下游任务模块随机初始化，然后微调（fine-tuning）就可以了（注意：微调的时候，主模型和下游任务模块两部分的参数一般都要调整，也可以冻结一部分，调整另一部分）。

主模型由三部分构成：**嵌入层**、**编码器**、**池化层**。
如图：

![img](https://images.cnblogs.com/cnblogs_com/wangzb96/1789835/o_200618140451BERT%E4%B9%8B%E4%B8%BB%E6%A8%A1%E5%9E%8B.png)

其中

- 输入：一个个小批（mini-batch），小批里是`batch_size`个序列（句子或句子对），每个序列由若干个离散编码向量组成。
- 嵌入层：将输入的序列转换成连续分布式表示（distributed representation），即词嵌入（word embedding）或词向量（word vector）。
- 编码器：对每个序列进行非线性表示。
- 池化层：取出`[CLS]`标记（token）的表示（representation）作为整个序列的表示。
- 输出：编码器最后一层输出的表示（序列中每个标记的表示）和池化层输出的表示（序列整体的表示）。

下面具体介绍这些部分。

------

## [**1.1、输入**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

一般来说，输入BERT的可以是一句话：

```rust
I'm repairing immortals.
```

也可以是两句话：

```rust
I'm repairing immortals. ||| Me too.
```

其中`|||`是分隔两个句子的分隔符。

BERT先用专门的**标记器**（tokenizer）来标记（tokenize）序列，双句标记后如下（单句类似）：

```makefile
I ' m repair ##ing immortal ##s . ||| Me too .
```

标记器其实就是先对句子进行基于规则的标记化（tokenization），这一步可以把`'m`以及句号`.`等分割开，再进行子词分割（subword segmentation），示例中带`##`的就是被子词分割开的部分。
子词分割有很多好处，比如压缩词汇表、表示未登录词（out of vocabulary words, OOV words）、表示单词内部结构信息等，以后有时间专门写一篇介绍这个。

数据集中的句子长度不一定相等，BERT采用固定输入序列（长则截断，短则填充）的方式来解决这个问题。
首先需要设定一个`seq_length`超参数（hyperparameter），然后判断整个序列长度是否超出，如果超出：单句截掉最后超出的部分，双句则先删掉较长的那句话的末尾标记，如果两句话长度相等，则轮流删掉两句话末尾的标记，直到总长度达到要求（即等长的两句话删掉的标记数量尽量相等）；如果序列长度过小，则在句子最后添加`[PAD]`标记，使长度达到要求。

然后在序列最开始添加`[CLS]`标记，以及在每句话末尾添加`[SEP]`标记。
单句话添加一个`[CLS]`和一个`[SEP]`，双句话添加一个`[CLS]`和两个`[SEP]`。
`[CLS]`标记对应的表示作为整个序列的表示，`[SEP]`标记是专门用来分隔句子的。
注意：处理长度时需要考虑添加的`[CLS]`和`[SEP]`标记，使得最终总的长度=`seq_length`；`[PAD]`标记在整个序列的最末尾。

例如`seq_length`=12，则单句变为：

```makefile
[CLS] I ' m repair ##ing immortal ##s . [SEP] [PAD] [PAD]
```

如果`seq_length`=10，则双句变为：

```swift
[CLS] I ' m repair [SEP] Me too . [SEP]
```

分割完后，每一个空格分割的子字符串（substring）都看成一个标记（token），标记器通过查表将这些标记映射成整数编码。
单句如下：

```yaml
[101, 146, 112, 182, 6949, 1158, 15642, 1116, 119, 102, 0, 0]
```

最后整个序列由四种类型的编码向量表示，单句如下：

```css
标记编码：[101, 146, 112, 182, 6949, 1158, 15642, 1116, 119, 102, 0, 0]
位置编码：[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
句子位置编码：[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
注意力掩码：[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0]
```

其中，标记编码就是上面的序列中每个标记转成编码后得到的向量；位置编码记录每个标记的位置；句子位置编码记录每个标记属于哪句话，0是第一句话，1是第二句话（注意：`[CLS]`标记对应的是0）；注意力掩码记录某个标记是否是填充的，1表示非填充，0表示填充。

双句如下：

```css
标记编码：[101, 146, 112, 182, 6949, 102, 2508, 1315, 119, 102]
位置编码：[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
句子位置编码：[0, 0, 0, 0, 0, 0, 1, 1, 1, 1]
注意力掩码：[1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
```

上面的是英文的情况，中文的话BERT直接用汉字级别表示，即

```undefined
我在修仙（￣︶￣）↗
```

这样的句子分割成

```undefined
我 在 修 仙 （ ￣ ︶ ￣ ） ↗
```

然后每个汉字（包括中文标点）看成一个标记，应用上述操作即可。

------

## [**1.2、嵌入层**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

**嵌入层**的作用是将序列的离散编码表示转换成连续分布式表示。
离散编码只能表示A和B相等或不等，但是如果将其表示成连续分布式表示（即连续的N维空间向量），就可以计算AA与BB之间的相似度或距离了，从而表达更多信息。
这个是词嵌入或词向量的知识，可以参考Word2Vec相关内容，本文不再赘述了。

嵌入层包含三种组件：**嵌入变换**（embedding）、**层标准化**（layer normalization）、**随机失活**（dropout）。
如图：

![img](https://images.cnblogs.com/cnblogs_com/wangzb96/1789835/o_200618140633BERT%E4%B9%8B%E5%B5%8C%E5%85%A5%E5%B1%82.png)

------

### [**1.2.1、嵌入变换**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

**嵌入变换**实际上就是一个**线性变换**（linear transformation）。
传统上，离散标记往往表示成一个独热码（one-hot）向量，也叫标准基向量，即一个长度为VV的向量，其中只有一位为11，其他都为00。
在NLP&DL领域，VV一般是词汇表的大小。
但是这种向量往往维数很高（词汇表往往比较大）而且很稀疏（每个向量只有一位不为00），不好处理。
所以可以通过一个线性变换将这个向量转换成低维稠密的向量。

假设vv（VV）是标记tt的独热码向量，WW（V×HV×H）是一个VV行HH列的矩阵，则tt的嵌入ee为：



e=vWe=vW



实际上WW中每一行都可以看成一个词嵌入，而这个矩阵乘就是把vv中等于11的那个位置对应的WW中的词嵌入取出来。
在工程实践中，由于独热码向量比较占内存，而且矩阵乘效率也不高，所以往往用一个整数编码来代替独热码向量，然后直接用查表的方式取出对应的词嵌入。

所以假设nn是tt的编码，一般是在词汇表中的编号，那么上面的公式就可以改成：



e=Wne=Wn



其中下标表示取出对应的行。

那么一个标记化后的序列就可以表示成一个编码向量。
假设序列TT的编码向量为ss（LL），LL为序列的长度，即TT中有LL个标记。
如果词嵌入长度为HH，那么经过嵌入变换，得到TT的隐状态（hidden state）hh（L×HL×H）。

------

### [**1.2.2、层标准化**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

[**层标准化**](https://arxiv.org/abs/1607.06450)类似于**批标准化**（batch normalization），可以加速模型训练，但其实现方式和批标准化不一样，层标准化是沿着词嵌入（通道）维进行标准化的，不需要在训练时存储统计量来估计整体数据集的均值和方差，训练（training）和评估（evaluation）或推理（inference）阶段的操作是相同的。
另外批标准化对小批大小有限制，而层标准化则没有限制。

假设输入的一个词嵌入为e=[x0,x1,...,xH−1]e=[x0,x1,...,xH−1]，xkxk是ee第k=0,1,...,(H−1)k=0,1,...,(H−1) 维的分量，HH是词嵌入长度。
那么层标准化就是



yk=xk−μσ∗αk+βkyk=xk−μσ∗αk+βk



其中，ykyk是输出，μμ和σ2σ2分别是均值和方差：



μ=1HH−1∑k=0xkσ2=1HH−1∑k=0(xk−μ)2μ=1H∑k=0H−1xkσ2=1H∑k=0H−1(xk−μ)2



αkαk和βkβk是学习得到的参数，用于防止模型表示能力退化。

注意：μμ和σ2σ2是针对每个样本每个位置的词嵌入分别计算的，而αkαk和βkβk对所有的词嵌入都是共用的；σ2σ2的计算没有使用贝塞尔校正（Bessel's correction）。

------

### [**1.2.3、随机失活**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

[**随机失活**](https://arxiv.org/abs/1207.0580)是DL领域非常著名且常用的正则化（regularization）方法（然而被谷歌注册专利了），用来防止模型过拟合（overfitting）。

具体来说，先设置一个超参数P∈[0,1]P∈[0,1]，表示按照概率PP随机将值置00。
然后假设词嵌入中某一维分量是xx，按照均匀随机分布产生一个随机数r∈[0,1]r∈[0,1]，然后输出值yy为：



y={x1−P,r>P0,r≤Py={x1−P,r>P0,r≤P



由于按照概率PP置00，相当于输出值的期望变成原来的(1−P)(1−P)倍，所以再对输出值除以(1−P)(1−P)，就可以保持期望不变。

以上操作针对训练阶段，在评估阶段，输出值等于输入值：



y=xy=x



------

嵌入层代码如下：

<details open="" data-math-rendered="true"><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" has-selection="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"># BERT之嵌入层</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">BertEmb</span>(nn.Module):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, config</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__()
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标记嵌入，padding_idx=0：编码为0的嵌入始终为零向量</span>
		self.tok_emb = nn.Embedding(config.vocab_size, config.hidden_size, padding_idx=<span class="hljs-number" style="color: rgb(136, 0, 0);">0</span>)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 位置嵌入</span>
		self.pos_emb = nn.Embedding(config.max_position_embeddings, config.hidden_size)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 句子位置嵌入</span>
		self.sent_pos_emb = nn.Embedding(config.type_vocab_size, config.hidden_size)

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 层标准化</span>
		self.layer_norm = nn.LayerNorm(config.hidden_size, eps=config.layer_norm_eps)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 随机失活</span>
		self.dropout = nn.Dropout(config.hidden_dropout_prob)

	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self,
			tok_ids,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标记编码（batch_size * seq_length）</span>
			pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 位置编码（batch_size * seq_length）</span>
			sent_pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 句子位置编码（batch_size * seq_length）</span>
	</span>):
		device = tok_ids.device  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 设备（CPU或CUDA）</span>
		shape = tok_ids.shape  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 形状（batch_size * seq_length）</span>
		seq_length = shape[<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>]

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 默认：[0, 1, ..., seq_length-1]</span>
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> pos_ids <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>:
			pos_ids = tc.arange(seq_length, dtype=tc.int64, device=device)
			pos_ids = pos_ids.unsqueeze(<span class="hljs-number" style="color: rgb(136, 0, 0);">0</span>).expand(shape)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 默认：[0, 0, ..., 0]，即所有标记都属于第一个句子</span>
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> sent_pos_ids <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>:
			sent_pos_ids = tc.zeros(shape, dtype=tc.int64, device=device)

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 三种嵌入（batch_size * seq_length * hidden_size）</span>
		tok_embs = self.tok_emb(tok_ids)
		pos_embs = self.pos_emb(pos_ids)
		sent_pos_embs = self.sent_pos_emb(sent_pos_ids)

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 三种嵌入相加</span>
		embs = tok_embs + pos_embs + sent_pos_embs
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 层标准化嵌入</span>
		embs = self.layer_norm(embs)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 随机失活嵌入</span>
		embs = self.dropout(embs)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> embs  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 嵌入（batch_size * seq_length * hidden_size）</span>
</code></pre></details>

其中，
`config`是BERT的配置文件对象，里面记录了各种预先设定的超参数；
`vocab_size`是词汇表大小；
`hidden_size`是词嵌入长度，默认是768（`bert-base-*`）或1024（`bert-large-*`）；
`max_position_embeddings`是允许的最大标记位置，默认是512；
`type_vocab_size`是允许的最大句子位置，即最多能输入的句子数量，默认是2；
`layer_norm_eps`是一个>0并很接近0的小数ϵϵ，用来防止计算时发生除0等异常操作；
`hidden_dropout_prob`是随机失活概率，默认是0.1；
`batch_size`是小批的大小，即一个小批里的样本个数；
`seq_length`是输入的编码向量的长度。

------

## [**1.3、编码器**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

**编码器**的作用是对嵌入层输出的隐状态进行非线性表示，提取出其中的特征（feature），它是由`num_hidden_layers`个结构相同（超参数相同）但参数不同（不共享参数）的**隐藏层**串连构成的。
如图：

![img](https://images.cnblogs.com/cnblogs_com/wangzb96/1789835/o_200618140641BERT%E4%B9%8B%E7%BC%96%E7%A0%81%E5%99%A8.png)

------

### [**1.3.1、隐藏层**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

**隐藏层**包括线性变换、**激活函数**（activation function）、**多头自注意力**（multi-head self-attention）、**跳跃连接**（skip connection），以及上面介绍过的层标准化和随机失活。
如图：

![img](https://images.cnblogs.com/cnblogs_com/wangzb96/1789835/o_200618140649BERT%E4%B9%8B%E9%9A%90%E8%97%8F%E5%B1%82.png)

其中，激活函数默认是GELU，线性变换均是逐位置线性变换，即对不同样本不同位置的词嵌入应用相同的线性变换（类似于CV&DL领域的1×11×1卷积）。

------

#### [**1.3.1.1、线性变换**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

**线性变换**在CV&DL领域也叫**全连接层**（fully connected layer），即



y=xWT+by=xWT+b



其中，xx（AA）是输入向量，yy（BB）是输出向量，WW（B×AB×A）是权重（weight）矩阵，bb（BB）是偏置（bias）向量；WW和bb是学习得到的参数。

另外，严格来说，当b=→0b=0→时，上式为线性变换；当b≠→0b≠0→时，上式为**仿射变换**（affine transformation）。
但是在DL中，人们往往并不那么抠字眼，对于这两种变换，一般都简单地称为线性变换。

------

#### [**1.3.1.2、激活函数**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

**激活函数**在DL中非常关键！
因为如果要提高一个**神经网络**（neural network）的表示能力，往往需要加深网络的深度。
然而如果只叠加多个线性变换的话，这等价于一个线性变换（大家可以推推看）！
所以只有在线性变换后接一个**非线性变换**（nonlinear transformation），即激活函数，才能逐渐加深网络并提高表示能力。

激活函数有很多，常见的包括**sigmoid**、**tanh**、**softmax**、**ReLU**、**GELU**、**Swish**、**Mish**等。
本文只讲和BERT相关的激活函数：tanh、softmax、GELU。

------

##### [**1.3.1.2.1、tanh**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

激活函数的一个功能是调整输入值的取值范围。
**tanh**即双曲正切函数，可以将(−∞,+∞)(−∞,+∞)的数映射到(−1,1)(−1,1)，并且严格单调。
函数图像如图：

![img](https://images.cnblogs.com/cnblogs_com/wangzb96/1789835/o_200618140703%E6%BF%80%E6%B4%BB%E5%87%BD%E6%95%B0%E4%B9%8Btanh.png)

tanh在NLP&DL领域用得比较多。

------

##### [**1.3.1.2.2、softmax**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

**softmax**顾名思义，它可以对输入的一组数值根据其大小给出每个数值的概率，数值越大，概率越高，且概率求和为11。

假设输入xkxk，k=0,1,...,(N−1)k=0,1,...,(N−1)，则输出值ykyk为：



yk=exp(xk)∑N−1i=0exp(xi)yk=exp(xk)∑i=0N−1exp(xi)



实际上，对于任意一个**对数几率**（logit）x∈(−∞,+∞)x∈(−∞,+∞)，xx越大，表示某个事件发生的可能性越大，softmax可以将其转化为概率，即将取值范围映射到(0,1)(0,1)。

------

##### [**1.3.1.2.3、GELU**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

[**GELU**](https://arxiv.org/abs/1606.08415)（**G**aussian **E**rror **L**inear **U**nits）是2016年6月提出的一个激活函数。
GELU相比ReLU曲线更为光滑，允许梯度更好地传播。
GELU的想法类似于随机失活，随机失活是按照**0-1分布**，又叫两点分布，也叫伯努利分布（Bernoulli distribution），随机通过输入值；而GELU则是将这个概率分布改成**正态分布**（Normal distribution），也叫高斯分布（Gaussian distribution），然后输出期望。

假设输入值是xx，输出值是yy，那么GELU就是：



y=xP(X≤x)y=xP(X≤x)



其中，X∼N(0,1)X∼N(0,1)，PP为概率。

GELU的函数图像如图：

![img](https://images.cnblogs.com/cnblogs_com/wangzb96/1789835/o_200618140709%E6%BF%80%E6%B4%BB%E5%87%BD%E6%95%B0%E4%B9%8BGELU.png)

其中蓝线为ReLU函数图像，橙线为GELU函数图像。

------

#### [**1.3.1.3、多头自注意力**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

**多头自注意力**是Transformer的一大特色。
多头自注意力的名字可以分成三个词：多头、自、注意力：

- 注意力：是DL领域近年来最重要的创新之一！可以使模型以不同的方式对待不同的输入（即分配不同的权重），而无视空间（即输入向量排成线形、面形、树形、图形等拓扑结构）的形状、大小、距离。
- 自：是在普通的注意力基础上修改而来的，可以表示输入与自身的依赖关系。
- 多头：是对注意力中涉及的向量分别拆分计算，从而提高表示能力。

对于一般的多头注意力，假设计算xx（HH）对yiyi（HH），i=0,1,...,(L−1)i=0,1,...,(L−1)，的多头注意力，则首先计算qq（H）、kiki（H）、vivi（H）：



q=xWTq+bqki=yiWTk+bkvi=yiWTv+bvq=xWqT+bqki=yiWkT+bkvi=yiWvT+bv



其中，WzWz（H×HH×H）和bzbz（HH）分别为权重矩阵和偏置向量，z∈{q,k,v}z∈{q,k,v}。
然后将这三种向量等长度拆分成SS个向量，称为头向量：



qj=[q0;q1;...;qS−1]kij=[ki0;ki1;...;ki,S−1]vij=[vi0;vi1;...;vi,S−1]qj=[q0;q1;...;qS−1]kij=[ki0;ki1;...;ki,S−1]vij=[vi0;vi1;...;vi,S−1]



上式中的分号为串连操作，即把多个向量拼接起来组成一个更长的向量。
其中，每个头向量长度都为DD，且S×D=HS×D=H。

然后计算qjqj对kijkij的注意力分数sijsij：



sij=qjkTij√Dsij=qjkijTD



之后可以添加注意力掩码（也可以不加），即令smj=−∞smj=−∞，mm是需要添加掩码的位置。
然后通过softmax计算注意力概率pijpij：



pij=exp(sij)∑L−1t=0exp(stj)pij=exp(sij)∑t=0L−1exp(stj)



之后对注意力概率进行随机失活：



^pij=dropout(pij)p^ij=dropout(pij)



再之后计算输出向量rjrj（DD）：



rj=L−1∑i=0^pijvijrj=∑i=0L−1p^ijvij



最终的输出向量是把每一头的输出向量串连起来：



r=[r0;r1;...;rS−1]r=[r0;r1;...;rS−1]



其中rr（HH）为最终的输出向量。

如果令x=ynx=yn，n∈{0,1,...,L−1}n∈{0,1,...,L−1}，即xx是yiyi中的某一个向量，那么多头注意力就变为多头自注意力。

代码如下：

<details data-math-rendered="true" open=""><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"># BERT之多头自注意力</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">BertMultiHeadSelfAtt</span>(nn.Module):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, config</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__()
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力头数</span>
		self.num_heads = config.num_attention_heads
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力头向量长度</span>
		self.head_size = config.hidden_size // config.num_attention_heads

		self.query = nn.Linear(config.hidden_size, config.hidden_size)
		self.key = nn.Linear(config.hidden_size, config.hidden_size)
		self.value = nn.Linear(config.hidden_size, config.hidden_size)

		self.dropout = nn.Dropout(config.attention_probs_dropout_prob)

	<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 输入（batch_size * seq_length * hidden_size）</span>
	<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 输出（batch_size * num_heads * seq_length * head_size）</span>
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">shape</span>(<span class="hljs-params">self, x</span>):
		shape = (*x.shape[:<span class="hljs-number" style="color: rgb(136, 0, 0);">2</span>], self.num_heads, self.head_size)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> x.view(*shape).transpose(<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, <span class="hljs-number" style="color: rgb(136, 0, 0);">2</span>)
	<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 输入（batch_size * num_heads * seq_length * head_size）</span>
	<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 输出（batch_size * seq_length * hidden_size）</span>
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">unshape</span>(<span class="hljs-params">self, x</span>):
		x = x.transpose(<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, <span class="hljs-number" style="color: rgb(136, 0, 0);">2</span>).contiguous()
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> x.view(*x.shape[:<span class="hljs-number" style="color: rgb(136, 0, 0);">2</span>], -<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>)

	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self,
			inputs,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 输入（batch_size * seq_length * hidden_size）</span>
			att_masks=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力掩码（batch_size * seq_length * hidden_size）</span>
	</span>):
		mixed_querys = self.query(inputs)
		mixed_keys = self.key(inputs)
		mixed_values = self.value(inputs)

		querys = self.shape(mixed_querys)
		keys = self.shape(mixed_keys)
		values = self.shape(mixed_values)

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力分数（batch_size * num_heads * seq_length * seq_length）</span>
		att_scores = querys.matmul(keys.transpose(<span class="hljs-number" style="color: rgb(136, 0, 0);">2</span>, <span class="hljs-number" style="color: rgb(136, 0, 0);">3</span>))
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 缩放注意力分数</span>
		att_scores = att_scores / sqrt(self.head_size)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 添加注意力掩码</span>
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> att_masks <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">not</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>:
			att_scores = att_scores + att_masks

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力概率（batch_size * num_heads * seq_length * seq_length）</span>
		att_probs = att_scores.softmax(dim=-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 随机失活注意力概率</span>
		att_probs = self.dropout(att_probs)

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 输出（batch_size * num_heads * seq_length * head_size）</span>
		outputs = att_probs.matmul(values)
		outputs = self.unshape(outputs)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> outputs  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 输出（batch_size * seq_length * hidden_size）</span>
</code></pre></details>

其中，
`num_attention_heads`是注意力头数，默认是12（`bert-base-*`）或16（`bert-large-*`）；
`attention_probs_dropout_prob`是注意力概率的随机失活概率，默认是0.1。

------

#### [**1.3.1.4、跳跃连接**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

**跳跃连接**也是DL领域近年来最重要的创新之一！
跳跃连接也叫**残差连接**（residual connection）。
一般来说，传统的神经网络往往是一层接一层串连而成，前一层输出作为后一层输入。
而跳跃连接则是某一层的输出，跳过若干层，直接输入某个更深的层。
例如BERT的每个隐藏层中有两个跳跃连接。

跳跃连接的作用是防止神经网络梯度消失或梯度爆炸，使损失曲面（loss surface）更平滑，从而使模型更容易训练，使神经网络可以设置得更深。

按我个人的理解，一般来说，线性变换是最能保持输入信息的，而非线性变换则往往会损失一部分信息，但是为了网络的表示能力不得不线性变换与非线性变换多次堆叠，这样网络深层接收到的信息与最初输入的信息比可能已经面目全非，而跳跃连接则可以让输入信息原汁原味地传播得更深。

------

隐藏层代码如下：

<details><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-title class_" style="color: rgb(163, 21, 21);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-title function_" style="color: rgb(163, 21, 21);"></span><span class="hljs-params"></span><span class="hljs-built_in" style="color: rgb(0, 0, 255);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-title function_" style="color: rgb(163, 21, 21);"></span><span class="hljs-params"><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-literal" style="color: rgb(163, 21, 21);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span></code></pre></details>

其中，
`intermediate_size`是中间一个升维线性变换升维后的长度，默认是3072（`bert-base-*`）或4096（`bert-large-*`）。

------

编码器代码如下：

<details><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-title class_" style="color: rgb(163, 21, 21);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-title function_" style="color: rgb(163, 21, 21);"></span><span class="hljs-params"></span><span class="hljs-built_in" style="color: rgb(0, 0, 255);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-built_in" style="color: rgb(0, 0, 255);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-title function_" style="color: rgb(163, 21, 21);"></span><span class="hljs-params"><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-literal" style="color: rgb(163, 21, 21);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-literal" style="color: rgb(163, 21, 21);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-number" style="color: rgb(136, 0, 0);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-literal" style="color: rgb(163, 21, 21);"></span><span class="hljs-literal" style="color: rgb(163, 21, 21);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span></code></pre></details>

其中，
`num_hidden_layers`是隐藏层数量，默认是12（`bert-base-*`）或24（`bert-large-*`）。

------

## [**1.4、池化层**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

**池化层**是将`[CLS]`标记对应的表示取出来，并做一定的变换，作为整个序列的表示并返回，以及原封不动地返回所有的标记表示。
如图：

![img](https://images.cnblogs.com/cnblogs_com/wangzb96/1789835/o_200618140656BERT%E4%B9%8B%E6%B1%A0%E5%8C%96%E5%B1%82.png)

其中，激活函数默认是tanh。

池化层代码如下：

<details open="" data-math-rendered="true"><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"># BERT之池化层</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">BertPool</span>(nn.Module):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, config</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__()
		self.linear = nn.Linear(config.hidden_size, config.hidden_size)
		self.act_fct = F.tanh
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self,
			inputs,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 输入（batch_size * seq_length * hidden_size）</span>
	</span>):
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 取[CLS]标记的表示</span>
		outputs = inputs[:, <span class="hljs-number" style="color: rgb(136, 0, 0);">0</span>]
		outputs = self.linear(outputs)
		outputs = self.act_fct(outputs)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> outputs  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 输出（batch_size * hidden_size）</span>
</code></pre></details>

------

## [**1.5、输出**](https://www.cnblogs.com/wangzb96/p/bert_model.html#目录)

主模型最后输出所有的标记表示和整体的序列表示，分别用于针对每个标记的预测任务和针对整个序列的预测任务。

------

主模型代码如下：

<details open="" data-math-rendered="true"><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"># BERT之预训练模型抽象基类</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">BertPreTrainedModel</span>(<span class="hljs-title class_ inherited__" style="color: rgb(163, 21, 21);">PreTrainedModel</span>):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">from</span> transformers <span class="hljs-keyword" style="color: rgb(0, 0, 255);">import</span> BertConfig
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">from</span> transformers <span class="hljs-keyword" style="color: rgb(0, 0, 255);">import</span> BERT_PRETRAINED_MODEL_ARCHIVE_MAP
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">from</span> transformers <span class="hljs-keyword" style="color: rgb(0, 0, 255);">import</span> load_tf_weights_in_bert

	config_class = BertConfig
	pretrained_model_archive_map = BERT_PRETRAINED_MODEL_ARCHIVE_MAP
	load_tf_weights = load_tf_weights_in_bert
	base_model_prefix = <span class="hljs-string" style="color: rgb(163, 21, 21);">'bert'</span>

	<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力头剪枝</span>
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">_prune_heads</span>(<span class="hljs-params">self, heads_to_prune</span>):
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">pass</span>
	<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 参数初始化</span>
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">_init_weights</span>(<span class="hljs-params">self, module</span>):
		config = self.config
		f = <span class="hljs-keyword" style="color: rgb(0, 0, 255);">lambda</span> x: x <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">not</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">and</span> x.requires_grad
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> <span class="hljs-built_in" style="color: rgb(0, 0, 255);">isinstance</span>(module, nn.Embedding):
			<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> f(module.weight):
				<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 正态分布随机初始化</span>
				module.weight.data.normal_(mean=<span class="hljs-number" style="color: rgb(136, 0, 0);">0.0</span>, std=config.initializer_range)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">elif</span> <span class="hljs-built_in" style="color: rgb(0, 0, 255);">isinstance</span>(module, nn.Linear):
			<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> f(module.weight):
				<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 正态分布随机初始化</span>
				module.weight.data.normal_(mean=<span class="hljs-number" style="color: rgb(136, 0, 0);">0.0</span>, std=config.initializer_range)
			<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> f(module.bias):
				<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 初始为0</span>
				module.bias.data.zero_()
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">elif</span> <span class="hljs-built_in" style="color: rgb(0, 0, 255);">isinstance</span>(module, nn.LayerNorm):
			<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> f(module.weight):
				<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 初始为1</span>
				module.weight.data.fill_(<span class="hljs-number" style="color: rgb(136, 0, 0);">1.0</span>)
			<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> f(module.bias):
				<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 初始为0</span>
				module.bias.data.zero_()
<span class="hljs-comment" style="color: rgb(0, 128, 0);"># BERT之主模型</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">BertModel</span>(<span class="hljs-title class_ inherited__" style="color: rgb(163, 21, 21);">BertPreTrainedModel</span>):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, config</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__(config)
		self.config = config
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 嵌入层</span>
		self.emb = BertEmb(config)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 编码器</span>
		self.enc = BertEnc(config)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 池化层</span>
		self.pool = BertPool(config)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 参数初始化</span>
		self.init_weights()

	<span class="hljs-comment" style="color: rgb(0, 128, 0);"># noinspection PyUnresolvedReferences</span>
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">get_input_embeddings</span>(<span class="hljs-params">self</span>):
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> self.emb.tok_emb
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">set_input_embeddings</span>(<span class="hljs-params">self, embs</span>):
		self.emb.tok_emb = embs

	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self,
			tok_ids,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标记编码（batch_size * seq_length）</span>
			pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 位置编码（batch_size * seq_length）</span>
			sent_pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 句子位置编码（batch_size * seq_length）</span>
			att_masks=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力掩码（batch_size * seq_length）</span>
	</span>):
		outputs = self.emb(tok_ids, pos_ids=pos_ids, sent_pos_ids=sent_pos_ids)
		outputs = self.enc(outputs, att_masks=att_masks)
		pooled_outputs = self.pool(outputs)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> (
			outputs,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 输出（batch_size * seq_length * hidden_size）</span>
			pooled_outputs,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 池化输出（batch_size * hidden_size）</span>
		)
</code></pre></details>

其中，
`BertPreTrainedModel`是预训练模型抽象基类，用于完成一些初始化工作。

------

## **后记**

本文详细地介绍了BERT主模型的结构及其组件，了解它的构造以及代码实现对于理解以及应用BERT有非常大的帮助。
后续两篇文章会分别介绍BERT[预训练](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html)和[下游任务](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html)相关。

从BERT主模型的结构中，我们可以发现，BERT抛弃了RNN架构，而只用注意力机制来抽取长距离依赖（这个其实是Transformer架构的特点）。
由于注意力可以并行计算，而RNN必须串行计算，这就使得模型计算效率大大提升，于是BERT这类模型也能够堆得很深。
BERT为了能够同时做单句和双句的序列和标记的预测任务，设计了`[CLS]`和`[SEP]`等特殊标记分别作为序列表示以及标记不同的句子边界，整体采用了桶状的模型结构，即输入时隐状态的形状与输出时隐状态的形状相等（只是在每个隐藏层有升维与降维操作，整体上词嵌入长度保持不变）。
由于注意力机制对距离不敏感，所以BERT额外添加了位置特征。

------

标签: [PyTorch](https://www.cnblogs.com/wangzb96/tag/PyTorch/) , [Python](https://www.cnblogs.com/wangzb96/tag/Python/) , [BERT](https://www.cnblogs.com/wangzb96/tag/BERT/) , [Transformer](https://www.cnblogs.com/wangzb96/tag/Transformer/) , [深度语言表示](https://www.cnblogs.com/wangzb96/tag/深度语言表示/) , [深度学习](https://www.cnblogs.com/wangzb96/tag/深度学习/) , [注意力机制](https://www.cnblogs.com/wangzb96/tag/注意力机制/) , [自然语言处理（NLP）](https://www.cnblogs.com/wangzb96/tag/自然语言处理（NLP）/)



# 原来你是这样的BERT，i了i了！ —— 超详细BERT介绍（二）BERT预训练

[**BERT**](https://arxiv.org/abs/1810.04805)（**B**idirectional **E**ncoder **R**epresentations from **T**ransformers）是谷歌在2018年10月推出的**深度语言表示**模型。

一经推出便席卷整个NLP领域，带来了革命性的进步。
从此，无数英雄好汉竞相投身于这场追剧（芝麻街）运动。
只听得这边G家110亿，那边M家又1750亿，真是好不热闹！

然而大家真的了解BERT的具体构造，以及使用细节吗？
本文就带大家来细品一下。

------

## **前言**

本系列文章分成三篇介绍BERT，上一篇介绍了BERT[主模型](https://www.cnblogs.com/wangzb96/p/bert_model.html)的结构及其组件相关，本篇则主要介绍BERT预训练相关知识，其后还会有一篇介绍如何将BERT应用到不同的[下游任务](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html)。

文章中的一些缩写：NLP（natural language processing）自然语言处理；CV（computer vision）计算机视觉；DL（deep learning）深度学习；NLP&DL 自然语言处理和深度学习的交叉领域；CV&DL 计算机视觉和深度学习的交叉领域。

文章公式中的向量均为行向量，矩阵或张量的形状均按照PyTorch的方式描述。
向量、矩阵或张量后的括号表示其形状。

本系列文章的代码均是基于[transformers](https://github.com/huggingface/transformers)库（v2.11.0）的代码（基于Python语言、PyTorch框架）。
为便于理解，简化了原代码中不必要的部分，并保持主要功能等价。

阅读本系列文章需要一些背景知识，包括**Word2Vec**、**LSTM**、**Transformer-Base**、**ELMo**、**GPT**等，由于本文不想过于冗长（其实是懒），以及相信来看本文的读者们也都是冲着BERT来的，所以这部分内容还请读者们自行学习。
本文假设读者们均已有相关背景知识。

------

## **目录**

- 2、预训练
  - 2.1、损失函数
    - [2.1.1、均方误差损失函数](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#211、均方误差损失函数)
    - 2.1.2、交叉熵损失函数
      - [2.1.2.1、熵](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#2121、熵)
      - [2.1.2.2、KL散度](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#2122、kl散度)
      - [2.1.2.3、交叉熵](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#2123、交叉熵)
  - [2.2、遮盖的语言模型](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#22、遮盖的语言模型)
  - [2.3、下一句预测](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#23、下一句预测)

------

# [**2、预训练**](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#目录)

BERT的预训练是一大特色，BERT经过预训练后，只需要在下游任务的数据集上进行少数几轮（epoch）的监督学习（supervised learning），就可以大幅度提升下游任务的精度。
另外，BERT的预训练是通过无监督学习（unsupervised learning）实现的。
预训练所使用的无监督数据集往往非常大，而下游任务的监督数据集则可以很小。
由于网络上文本数据非常多，所以获取大规模无监督的文本数据集是相对容易的。

BERT在预训练时学习两种任务：遮盖的语言模型（masked language model， MLM）、下一句预测（next sentence prediction，NSP）。

- 遮盖的语言模型：在输入的序列中随机把原标记替换成`[MASK]`标记，然后用主模型输出的标记表示来预测所有原标记，即学习标记的概率分布。
- 下一句预测：训练数据随机取同一篇文章中连续两句话，或分别来自不同文章的两句话，用序列表示来预测是否是连续的两句话（二分类）。

下面先来讲解一下BERT用到的损失函数，然后再讲解以上两个学习任务。

------

## [**2.1、损失函数**](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#目录)

BERT中主要使用到了**回归**（regression）和**分类**（classification）损失函数。
回归任务常用**均方误差**（mean square error，MSE）作为损失函数，而分类任务一般用**交叉熵**（cross entropy，CE）作为损失函数。

------

### [**2.1.1、均方误差损失函数**](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#目录)

**均方误差**可以度量连续的预测值和真实值之间的差异。
假设^yiyi^是预测值，yiyi是真实值，i=0,1,...,(N−1)i=0,1,...,(N−1)是样本的编号，总共有NN个样本，那么损失lossloss为：



loss=1NN−1∑i=0(^yi−yi)2loss=1N∑i=0N−1(yi^−yi)2



有时为了方便求导，会对这个lossloss除以22。
由于学习任务是让lossloss最小化，给lossloss乘以一个常量对学习任务是没有影响的。

------

### [**2.1.2、交叉熵损失函数**](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#目录)

**交叉熵**理解起来略有些复杂。

------

#### [**2.1.2.1、熵**](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#目录)

首先来看看什么是**熵**（entropy）。
熵是用来衡量随机变量的不确定性的，熵越大，不确定性越大，就需要越多的信息来消除不确定性。
比如小明考试打小抄，对于答案简短的题目，只需要简单做个标记，而像背古诗这种的，就需要更多字来记录了。

假设离散随机变量X∼PX∼P，则



−log(P(x))−log(P(x))



称为xx（XX的某个取值）的信息量，单位是奈特（nat）或比特（bit），取决于对数是以ee还是以22为底的。



H(X)=−∑xP(x)log(P(x))H(X)=−∑xP(x)log(P(x))



H(X)H(X)为XX（XX的所有取值）的信息量的期望，即熵，单位同上。

另外，由于熵和概率分布有关，所以很多时候写作某个概率分布的熵，而不是某个随机变量的熵。

------

#### [**2.1.2.2、KL散度**](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#目录)

**KL散度**（Kullback-Leibler divergence），也叫相对熵（relative entropy）。

假设有概率分布PP、QQ，一般分别表示真实分布和预测分布，KL散度可以用来衡量两个分布的差异。
KL散度定义为：



DKL(P||Q)=∑xP(x)log(P(x)Q(x))DKL(P||Q)=∑xP(x)log(P(x)Q(x))



将公式稍加修改：



DKL(P||Q)=∑xP(x)((−log(Q(x)))−(−log(P(x))))DKL(P||Q)=∑xP(x)((−log(Q(x)))−(−log(P(x))))



可以看出，KL散度实际上是用概率分布PP来计算QQ对PP的信息量差的期望。
如果P=QP=Q，那么DKL(P||Q)=0DKL(P||Q)=0。
另外可以证明，DKL(P||Q)≥0DKL(P||Q)≥0总是成立，本文证明略。

如果把上式拆开，就是



DKL(P||Q)=H(P,Q)−H(P)DKL(P||Q)=H(P,Q)−H(P)



其中，H(P,Q)H(P,Q)称为QQ对PP的**交叉熵**，H(P)H(P)是PP的熵。

------

#### [**2.1.2.3、交叉熵**](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#目录)

由于KL散度描述了两个分布信息量差的期望，所以可以通过最小化KL散度来使得两个分布接近。
而在一些学习任务中，比如分类任务，真实分布是固定的，即H(P)H(P)是固定的，所以最小化KL散度等价于最小化交叉熵。

交叉熵公式为：



H(P,Q)=−∑xP(x)log(Q(x))H(P,Q)=−∑xP(x)log(Q(x))



------

单标签分类任务中，假设^yik∈[0,1]y^ik∈[0,1]和yik∈{0,1}yik∈{0,1}分别是第i=0,1,...,(N−1)i=0,1,...,(N−1)个样本第k=0,1,...,(K−1)k=0,1,...,(K−1)类的预测值和真实值，其中∑K−1k=0^yik=∑K−1k=0yik=1∑k=0K−1y^ik=∑k=0K−1yik=1，NN是样本数量，KK是类别数量，则损失lossloss为：



loss=−1NN−1∑i=0K−1∑k=0yiklog(^yik)loss=−1N∑i=0N−1∑k=0K−1yiklog(y^ik)



------

损失函数代码如下：

<details open="" data-math-rendered="true"><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"># 损失函数之回归</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">LossRgrs</span>(nn.Module):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, *args, **kwargs</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__()
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 均方误差损失函数</span>
		self.loss_fct = nn.MSELoss(*args, **kwargs)
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self, logits, labels</span>):
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> self.loss_fct(logits.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>), labels.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>))
<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 损失函数之分类</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">LossCls</span>(nn.Module):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, num_classes, *args, **kwargs</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__()
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标签的类别数量</span>
		self.num_classes = num_classes
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 交叉熵损失函数</span>
		self.loss_fct = nn.CrossEntropyLoss(*args, **kwargs)
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self, logits, labels</span>):
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> self.loss_fct(logits.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, self.num_classes), labels.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>))
<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 损失函数之回归或分类</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">LossRgrsCls</span>(nn.Module):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, num_classes, *args, **kwargs</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__()
		self.loss_fct = (LossRgrs(*args, **kwargs) <span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">not</span> num_classes&lt;=<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>
			<span class="hljs-keyword" style="color: rgb(0, 0, 255);">else</span> LossCls(num_classes, *args, **kwargs))
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self, logits, labels</span>):
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> self.loss_fct(logits, labels)
</code></pre></details>

其中，
`num_classes`是标签的类别数量，BERT应用到序列分类任务时，如果类别数量=1则为回归任务，否则为分类任务。

注意：无论是回归还是分类任务，模型输出表示后，都需要将表示转化成预测值，一般是在模型最后通过一个线性回归或分类器（其实也是一个线性变换）来实现，回归任务得到的就是预测值，然后直接输入MSE损失函数计算损失就可以了；而分类任务得到的是对数几率（logit），还要用softmax函数转化成概率，再通过CE损失函数计算损失，而PyTorch中softmax和CE封装在一起了，所以直接输入对数几率就可以了。

------

## [**2.2、遮盖的语言模型**](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#目录)

**语言模型**（language model，LM）是对语言（字符串）进行数学建模（表示）。
传统的语言模型包括离散的和连续的（分布式的），离散的最经典的是**词袋**（bag of words，BOW）模型和**N元文法**（N-gram）模型，连续的包括Word2Vec等，这些本文就不细说了。

然而到了DL时代，语言模型就是想个办法让神经网络学习序列的概率分布。
MLM采用了**降噪自编码器**（denoising autoencoder，DAE）的思想，简单来说，就是在输入数据中加噪声，输入神经网络后再让神经网络恢复出原本无噪声的数据，从而让模型学习到了联想能力，即输入数据的概率分布。

具体来说，MLM将序列中的标记随机替换成`[MASK]`标记，例如

```makefile
I ' m repair ##ing immortal ##s .
```

这句话，修改成

```makefile
I ' m repair [MASK] immortal ##s .
```

如果模型可以成功预测出`[MASK]`对应的原标记是`##ing`，那么就可以认为模型学到了现在进行时要加ing的知识。

另外在计算损失的时候，是所有标记都要参与计算的。

------

## [**2.3、下一句预测**](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html#目录)

NSP是为了让模型学会表示句子连贯性等较为深层次的语言特征而设计的。

具体来说，首先看如下例子（来自transformers库的示例）：

```vbnet
This text is included to make sure ...
Text should be one-sentence-per-line ...
This sample text is public domain ...

The rain had only ceased with the gray streaks ...
Indeed, it was recorded in Blazing Star that ...
Possibly this may have been the reason ...
"Cass" Beard had risen early that morning ...
A leak in his cabin roof ...

The fountain of classic wisdom ...
As the ancient sage ...
From my youth I felt in me a soul ...
She revealed to me the glorious fact ...
A fallen star, I am, sir ...
```

其中，每一行都是一个句子（原句子太长，所以省略了一部分），不同的文章用空行来隔开。
如果选择来自同一篇文章连续的两个句子：

```vhdl
This text is included to make sure ... ||| Text should be one-sentence-per-line ...
```

则NSP的标签为1；如果选择来自不同文章的两个句子：

```vbnet
This text is included to make sure ... ||| The fountain of classic wisdom ...
```

则NSP的标签为0。

------

另外无论是MLM还是NSP，BERT预训练的数据是在训练之前静态生成好的。

预训练代码如下：

<details open="" data-math-rendered="true"><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" has-selection="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"># BERT之预训练</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">BertForPreTrain</span>(<span class="hljs-title class_ inherited__" style="color: rgb(163, 21, 21);">BertPreTrainedModel</span>):
	<span class="hljs-comment" style="color: rgb(0, 128, 0);"># noinspection PyUnresolvedReferences</span>
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, config</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__(config)
		self.config = config

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 主模型</span>
		self.bert = BertModel(config)
		self.linear = nn.Linear(config.hidden_size, config.hidden_size)
		self.act_fct = F.gelu
		self.layer_norm = nn.LayerNorm(config.hidden_size, eps=config.layer_norm_eps)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标记线性分类器</span>
		self.cls = nn.Linear(config.hidden_size, config.vocab_size)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 句子关系线性分类器</span>
		self.nsp_cls = nn.Linear(config.hidden_size, <span class="hljs-number" style="color: rgb(136, 0, 0);">2</span>)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标记分类损失函数</span>
		self.loss_fct = LossCls(config.vocab_size)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 句子关系分类损失函数</span>
		self.nsp_loss_fct = LossCls(<span class="hljs-number" style="color: rgb(136, 0, 0);">2</span>)

		self.init_weights()

	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">get_output_embeddings</span>(<span class="hljs-params">self</span>):
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> self.cls

	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self,
			tok_ids,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标记编码（batch_size * seq_length）</span>
			pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 位置编码（batch_size * seq_length）</span>
			sent_pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 句子位置编码（batch_size * seq_length）</span>
			att_masks=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力掩码（batch_size * seq_length）</span>
			mlm_labels=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># MLM标记标签（batch_size * seq_length）</span>
			nsp_labels=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># NSP句子关系标签（batch_size）</span>
	</span>):
		outputs, pooled_outputs = self.bert(
			tok_ids,
			pos_ids=pos_ids,
			sent_pos_ids=sent_pos_ids,
			att_masks=att_masks,
		)

		outputs = self.linear(outputs)
		outputs = self.act_fct(outputs)
		outputs = self.layer_norm(outputs)
		logits = self.cls(outputs)
		nsp_logits = self.nsp_cls(pooled_outputs)

		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> mlm_labels <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">and</span> nsp_labels <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>:
			<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> (
				logits,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标记对数几率（batch_size * seq_length * vocab_size）</span>
				nsp_logits,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 句子关系对数几率（batch_size * 2）</span>
			)

		loss = <span class="hljs-number" style="color: rgb(136, 0, 0);">0</span>
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> mlm_labels <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">not</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>:
			loss = loss + self.loss_fct(logits, mlm_labels)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> nsp_labels <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">not</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>:
			loss = loss + self.nsp_loss_fct(nsp_logits, nsp_labels)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> loss
</code></pre></details>

------

## **后记**

本文详细地介绍了BERT预训练，BERT预训练是BERT有出色性能的关键，其中所使用的学习任务也是BERT的一大亮点。
后续一篇文章会介绍BERT[下游任务](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html)相关。

从BERT预训练的实现中可以发现，BERT巧妙地充分利用了主模型输出的标记表示和序列表示，并分别学习标记分布概率和句子连贯性，并且运用了DAE的思想，以及两种学习任务都可以通过无监督的方式实现。

然而后续的一些研究也对BERT提出了批评，例如采用MLM学习，预训练时训练数据中有`[MASK]`标记，而微调时没有这个标记，这就导致预训练和微调的数据分布不一致；NSP并不能使模型学习到句子连贯性特征，因为来自不同文章的句子可能主题（topic）不一样，NSP最终可能只学习了主题特征，而主题特征是文本中的浅层次特征，应该改为来自同一篇文章连续的或不连续的两句话作为改良版的NSP训练数据；MLM是一种生成式任务，生成式任务也可以看成分类任务，只不过一个类是词汇表里的一个标记，词汇表往往比较大，所以类别往往很多，计算损失之前要将表示转化成长度为词汇表长度的对数几率向量，这个计算量是比较大的，如果模型又很大，那么整个学习任务对算力要求就会很高；BERT在计算每个标记的标签时，是独立计算的，即认为标记之间的标签是相互独立的，这往往不符合实际，所以其实BERT对标记分类（序列标注）任务的效果不是非常好。

------

标签: [Transformer](https://www.cnblogs.com/wangzb96/tag/Transformer/) , [PyTorch](https://www.cnblogs.com/wangzb96/tag/PyTorch/) , [Python](https://www.cnblogs.com/wangzb96/tag/Python/) , [BERT](https://www.cnblogs.com/wangzb96/tag/BERT/) , [深度学习](https://www.cnblogs.com/wangzb96/tag/深度学习/) , [深度语言表示](https://www.cnblogs.com/wangzb96/tag/深度语言表示/) , [自然语言处理（NLP）](https://www.cnblogs.com/wangzb96/tag/自然语言处理（NLP）/) , [预训练](https://www.cnblogs.com/wangzb96/tag/预训练/)



# 原来你是这样的BERT，i了i了！ —— 超详细BERT介绍（三）BERT下游任务

[**BERT**](https://arxiv.org/abs/1810.04805)（**B**idirectional **E**ncoder **R**epresentations from **T**ransformers）是谷歌在2018年10月推出的**深度语言表示**模型。

一经推出便席卷整个NLP领域，带来了革命性的进步。
从此，无数英雄好汉竞相投身于这场追剧（芝麻街）运动。
只听得这边G家110亿，那边M家又1750亿，真是好不热闹！

然而大家真的了解BERT的具体构造，以及使用细节吗？
本文就带大家来细品一下。

------

## **前言**

本系列文章分成三篇介绍BERT，上两篇分别介绍了BERT[主模型](https://www.cnblogs.com/wangzb96/p/bert_model.html)的结构及其组件相关和BERT[预训练](https://www.cnblogs.com/wangzb96/p/bert_pretrain.html)相关，这一篇是最终话，介绍如何将BERT应用到不同的下游任务。

文章中的一些缩写：NLP（natural language processing）自然语言处理；CV（computer vision）计算机视觉；DL（deep learning）深度学习；NLP&DL 自然语言处理和深度学习的交叉领域；CV&DL 计算机视觉和深度学习的交叉领域。

文章公式中的向量均为行向量，矩阵或张量的形状均按照PyTorch的方式描述。
向量、矩阵或张量后的括号表示其形状。

本系列文章的代码均是基于[transformers](https://github.com/huggingface/transformers)库（v2.11.0）的代码（基于Python语言、PyTorch框架）。
为便于理解，简化了原代码中不必要的部分，并保持主要功能等价。

阅读本系列文章需要一些背景知识，包括**Word2Vec**、**LSTM**、**Transformer-Base**、**ELMo**、**GPT**等，由于本文不想过于冗长（其实是懒），以及相信来看本文的读者们也都是冲着BERT来的，所以这部分内容还请读者们自行学习。
本文假设读者们均已有相关背景知识。

------

## **目录**

- [3、序列分类](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html#3、序列分类)
- [4、标记分类](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html#4、标记分类)
- [5、选择题](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html#5、选择题)
- [6、问答](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html#6、问答)

------

# [**3、序列分类**](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html#目录)

序列分类任务就是输入一个序列，输出整个序列的标签。
输入的序列可以是单句也可以是双句。
单句序列分类任务就是**文本分类**（text classification）任务，包括主题（topic）、情感（sentiment）、垃圾邮件（spam）等的分类任务；双句序列分类任务包括相似度（similarity）、释义（paraphrase）、蕴含（entailment）等的分类任务。
根据标签数量分，可以分成单标签和多标签（multi-label）的分类任务。
根据标签的类别数量分，可以分成二分类或三分类、五分类等多分类任务。

BERT中的序列分类任务包括单句和双句的单标签回归或分类任务，涉及到语言可接受性（linguistic acceptability）、情感、相似度、释义、蕴含等特征的分类，即[**GLUE**](https://gluebenchmark.com/)（**G**eneral **L**anguage **U**nderstanding **E**valuation）中的任务。

如下为一个相似度回归任务的例子（来自transformers库的示例）：

```vbnet
5.000	A plane is taking off. ||| An air plane is taking off.
3.800	A man is playing a large flute. ||| A man is playing a flute.
3.800	A man is spreading shreded cheese on a pizza. ||| A man is spreading shredded cheese on an uncooked pizza.
```

其中，最左边的是标签，表示两句话的相似度分数，分数越高，相似度越高，分数的取值范围是[0,5][0,5]。

再如下为一个双句释义二分类任务的例子（来自transformers库的示例）：

```erlang
1	He said the foodservice pie business ... ||| The foodservice pie business ...
0	Magnarelli said Racicot hated ... ||| His wife said he was ...
0	The dollar was at 116.92 yen against the yen ... ||| The dollar was at 116.78 yen JPY ...
```

其中，最左边的是标签，如果后句是前句的释义，即解释说明，那么标签为1，否则为0。

序列分类代码如下：

<details><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-title class_" style="color: rgb(163, 21, 21);"></span><span class="hljs-title class_ inherited__" style="color: rgb(163, 21, 21);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-title function_" style="color: rgb(163, 21, 21);"></span><span class="hljs-params"></span><span class="hljs-built_in" style="color: rgb(0, 0, 255);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-title function_" style="color: rgb(163, 21, 21);"></span><span class="hljs-params"><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-literal" style="color: rgb(163, 21, 21);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-literal" style="color: rgb(163, 21, 21);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-literal" style="color: rgb(163, 21, 21);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-literal" style="color: rgb(163, 21, 21);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-literal" style="color: rgb(163, 21, 21);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span><span class="hljs-comment" style="color: rgb(0, 128, 0);"></span><span class="hljs-keyword" style="color: rgb(0, 0, 255);"></span></code></pre></details>

其中，
`num_labels`是标签的类别数量（注意：并不是标签数量，BERT的序列分类任务均为单标签分类任务），=1时为回归任务。

------

# [**4、标记分类**](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html#目录)

标记分类任务就是输入一个序列，输出序列中每个标记的标签。
输入的序列一般是单句。
标记分类任务就是**序列标注**（sequence tagging）任务，包括中文分词（Chinese word segmentation）、词性标注（Part-of-Speech tagging，POS tagging）、命名实体识别（named entity recognition，NER）等。

序列标注任务常规的做法是BIO标注，B表示需要标注的片段的开头标记，I表示非开头标记，O表示不需要标注的标记。

如下为一个NER任务的例子（来自transformers库的示例）：

<details open="" data-math-rendered="true"><summary>例子</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="highlighter-hljs hljs language-css" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;">Schartau <span class="hljs-selector-tag" style="color: rgb(0, 0, 255);">B</span>-PER
sagte O
dem O
" O
Tagesspiegel <span class="hljs-selector-tag" style="color: rgb(0, 0, 255);">B</span>-ORG
" O
vom O
Freitag O
, O
Fischer <span class="hljs-selector-tag" style="color: rgb(0, 0, 255);">B</span>-PER
sei O
" O
in O
einer O
Weise O
aufgetreten O
, O
die O
alles O
andere O
als O
überzeugend O
war O
" O
. O

Firmengründer O
Wolf <span class="hljs-selector-tag" style="color: rgb(0, 0, 255);">B</span>-PER
Peter <span class="hljs-selector-tag" style="color: rgb(0, 0, 255);">I</span>-PER
Bree <span class="hljs-selector-tag" style="color: rgb(0, 0, 255);">I</span>-PER
arbeitete O
Anfang O
der O
siebziger O
Jahre O
als O
Möbelvertreter O
, O
als O
er O
einen O
fliegenden O
Händler O
aus O
dem O
Libanon <span class="hljs-selector-tag" style="color: rgb(0, 0, 255);">B</span>-LOC
traf O
. O

Ob O
sie O
dabei O
nach O
dem O
Runden O
Tisch O
am O
<span class="hljs-number" style="color: rgb(136, 0, 0);">23</span>. O
April O
in O
Berlin <span class="hljs-selector-tag" style="color: rgb(0, 0, 255);">B</span>-LOC
durch O
ein O
<span class="hljs-selector-tag" style="color: rgb(0, 0, 255);">p</span>ädagogisches O
Konzept O
unterstützt O
wird O
, O
ist O
allerdings O
zu O
bezweifeln O
. O
</code></pre></details>

其中，每一行为一个标记和其标签，空行分隔不同的句子；`PER`是人名、`ORG`是组织名、`LOC`是地名。

标记分类代码如下：

<details open="" data-math-rendered="true"><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"># BERT之标记分类</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">BertForTokCls</span>(<span class="hljs-title class_ inherited__" style="color: rgb(163, 21, 21);">BertPreTrainedModel</span>):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, config</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__(config)
		self.config = config
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标签的类别数量</span>
		self.num_labels = config.num_labels

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 主模型</span>
		self.bert = BertModel(config)
		self.dropout = nn.Dropout(config.hidden_dropout_prob)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 线性分类器</span>
		self.cls = nn.Linear(config.hidden_size, config.num_labels)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 分类损失函数</span>
		self.loss_fct = LossCls(config.num_labels)

		self.init_weights()

	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self,
			tok_ids,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标记编码（batch_size * seq_length）</span>
			pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 位置编码（batch_size * seq_length）</span>
			sent_pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 句子位置编码（batch_size * seq_length）</span>
			att_masks=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力掩码（batch_size * seq_length）</span>
			labels=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标签（batch_size * seq_length）</span>
	</span>):
		outputs, _ = self.bert(
			tok_ids,
			pos_ids=pos_ids,
			sent_pos_ids=sent_pos_ids,
			att_masks=att_masks,
		)

		outputs = self.dropout(outputs)
		logits = self.cls(outputs)

		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> labels <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>:
			<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> logits  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 对数几率（batch_size * seq_length * num_labels）</span>

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 只计算非填充标记的损失</span>
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> att_masks <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">not</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>:
			active = att_masks.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>)&gt;<span class="hljs-number" style="color: rgb(136, 0, 0);">0</span>
			logits = logits.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, self.num_labels)[active]
			labels = labels.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>)[active]
		loss = self.loss_fct(logits, labels)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> loss
</code></pre></details>

------

# [**5、选择题**](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html#目录)

BERT中的选择题是给出前句以及`num_choices`个后句，选择最优的后句。
如下（来自[SWAG](https://github.com/rowanz/swagaf/tree/master/data)数据集）：

```erlang
2
Students lower their eyes nervously. She
pats her shoulder, then saunters toward someone.
turns with two students.
walks slowly towards someone.
wheels around as her dog thunders out.
```

其中，第一行是标签，第二行是前句，第三行到最后是四个后句；标签数字从0开始计数，即标签为2表示第三个（`walks slowly towards someone.`）为正确选项。

BERT将每个样本转换成`num_choices`个双句：

```lua
Students lower their eyes nervously. ||| She pats her shoulder, then saunters toward someone.
Students lower their eyes nervously. ||| She turns with two students.
Students lower their eyes nervously. ||| She walks slowly towards someone.
Students lower their eyes nervously. ||| She wheels around as her dog thunders out.
```

然后每个双句的序列表示产生一个对数几率，`num_choices`个双句就得到一个长度为`num_choices`的对数几率向量，最后将这个向量作为这个样本的输出，计算损失即可。

选择题代码如下：

<details open="" data-math-rendered="true"><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"># BERT之选择题</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">BertForMultiChoice</span>(<span class="hljs-title class_ inherited__" style="color: rgb(163, 21, 21);">BertPreTrainedModel</span>):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, config</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__(config)
		self.config = config
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 选项个数</span>
		self.num_choices = config.num_choices

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 主模型</span>
		self.bert = BertModel(config)
		self.dropout = nn.Dropout(config.hidden_dropout_prob)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 线性分类器</span>
		self.cls = nn.Linear(config.hidden_size, <span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 分类损失函数</span>
		self.loss_fct = LossCls(<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>)

		self.init_weights()
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self,
			tok_ids,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标记编码（batch_size * num_choices * seq_length）</span>
			pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 位置编码（batch_size * num_choices * seq_length）</span>
			sent_pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 句子位置编码（batch_size * num_choices * seq_length）</span>
			att_masks=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力掩码（batch_size * num_choices * seq_length）</span>
			labels=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标签（batch_size）</span>
	</span>):
		seq_length = tok_ids.shape[-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>]

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 调整形状，每个前句-后句选项对看作一个双句输入</span>
		tok_ids = tok_ids.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, seq_length)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> pos_ids <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">not</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>: pos_ids = pos_ids.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, seq_length)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> sent_pos_ids <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">not</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>: sent_pos_ids = sent_pos_ids.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, seq_length)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> att_masks <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">not</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>: att_masks = att_masks.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, seq_length)

		_, pooled_outputs = self.bert(
			tok_ids,
			pos_ids=pos_ids,
			sent_pos_ids=sent_pos_ids,
			att_masks=att_masks,
		)

		pooled_outputs = self.dropout(pooled_outputs)
		logits = self.cls(pooled_outputs)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 调整形状，每num_choices个对数几率看作一个样本的输出</span>
		logits = logits.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, self.num_choices)

		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> labels <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>:
			<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> logits  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 对数几率（batch_size * num_choices）</span>

		loss = self.loss_fct(logits, labels)
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> loss
</code></pre></details>

其中，
`num_choices`是选项个数。

------

# [**6、问答**](https://www.cnblogs.com/wangzb96/p/bert_downstream_tasks.html#目录)

BERT中的问答任务其实是抽取式的**机器阅读理解**（machine reading comprehension）任务，即给定一段话，给定一个问题，问题的答案来自这段话的某个连续的片段。
如下（来自transformers库的示例）：

```mipsasm
0	Computational complexity theory
What branch of theoretical computer science deals with broadly classifying computational problems by difficulty and class of relationship?
Computational complexity theory is a branch of the theory of computation in theoretical computer science that focuses on classifying computational problems according to their inherent difficulty ...
```

其中，第一行是答案，答案左边的数字表示这个答案在给定的这段话的起始位置（从0开始计数），第二行是问题，第三行是给定的一段话。

BERT将这个抽取式任务转化为一个预测答案起始和结束位置的分类任务，标签的类别数量是`seq_length`，起始位置和结束位置分别预测，即相当于两个标签。
注意：这个起始和结束位置是标记化等预处理后答案在输入的编码向量里的位置。

BERT将所有的标记表示转化成两个对数几率，然后横向切片，得到两个长度为`seq_length`的对数几率向量，分别作为起始和结束位置的预测，最后计算损失即可。

问答代码如下：

<details open="" data-math-rendered="true"><summary>代码</summary><pre class="highlighter-hljs" highlighted="true" has-selection="true" style="transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; overflow: auto; margin-top: 0px; margin-bottom: 0px; tab-size: 4;"><code class="language-Python highlighter-hljs hljs" style="font-family: &quot;Courier New&quot;, sans-serif; transition-duration: 0.2s; transition-property: background, font-size, border-color, border-radius, border-width, padding, margin, color; background: rgb(245, 245, 245); color: rgb(68, 68, 68); padding: 1em; display: block; font-size: 12px; border: 1px solid rgb(204, 204, 204); border-radius: 3px; overflow-x: auto; line-height: 1.5; margin: 0px;"><span class="hljs-comment" style="color: rgb(0, 128, 0);"># BERT之问答</span>
<span class="hljs-keyword" style="color: rgb(0, 0, 255);">class</span> <span class="hljs-title class_" style="color: rgb(163, 21, 21);">BertForQustAns</span>(<span class="hljs-title class_ inherited__" style="color: rgb(163, 21, 21);">BertPreTrainedModel</span>):
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">__init__</span>(<span class="hljs-params">self, config</span>):
		<span class="hljs-built_in" style="color: rgb(0, 0, 255);">super</span>().__init__(config)
		self.config = config

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 主模型</span>
		self.bert = BertModel(config)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 线性分类器</span>
		self.cls = nn.Linear(config.hidden_size, <span class="hljs-number" style="color: rgb(136, 0, 0);">2</span>)

		self.init_weights()
	<span class="hljs-keyword" style="color: rgb(0, 0, 255);">def</span> <span class="hljs-title function_" style="color: rgb(163, 21, 21);">forward</span>(<span class="hljs-params">self,
			tok_ids,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标记编码（batch_size * seq_length）</span>
			pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 位置编码（batch_size * seq_length）</span>
			sent_pos_ids=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 句子位置编码（batch_size * seq_length）</span>
			att_masks=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 注意力掩码（batch_size * seq_length）</span>
			start_pos=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 起始位置标签（batch_size）</span>
			end_pos=<span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 结束位置标签（batch_size）</span>
	</span>):

		seq_length = tok_ids.shape[-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>]

		outputs, _ = self.bert(
			tok_ids,
			pos_ids=pos_ids,
			sent_pos_ids=sent_pos_ids,
			att_masks=att_masks,
		)

		logits = self.cls(outputs)
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 拆分起始和结束位置对数几率</span>
		start_logits, end_logits = logits.split(<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, dim=-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>)
		start_logits = start_logits.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, seq_length)
		end_logits = end_logits.view(-<span class="hljs-number" style="color: rgb(136, 0, 0);">1</span>, seq_length)

		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">if</span> start_pos <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span> <span class="hljs-keyword" style="color: rgb(0, 0, 255);">or</span> end_pos <span class="hljs-keyword" style="color: rgb(0, 0, 255);">is</span> <span class="hljs-literal" style="color: rgb(163, 21, 21);">None</span>:
			<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> (
				start_logits,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 起始位置对数几率（batch_size * seq_length）</span>
				end_logits,  <span class="hljs-comment" style="color: rgb(0, 128, 0);"># 结束位置对数几率（batch_size * seq_length）</span>
			)

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 标签值裁剪，使值 (- [0, seq_length]，</span>
		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># 其中合法值 (- [0, seq_length-1]，非法值 = seq_length</span>
		start_pos = start_pos.clamp(<span class="hljs-number" style="color: rgb(136, 0, 0);">0</span>, seq_length)
		end_pos = end_pos.clamp(<span class="hljs-number" style="color: rgb(136, 0, 0);">0</span>, seq_length)

		<span class="hljs-comment" style="color: rgb(0, 128, 0);"># ignore_index=seq_length：忽略标签值 = seq_length对应的损失</span>
		loss_fct = LossCls(seq_length, ignore_index=seq_length)
		start_loss = loss_fct(start_logits, start_pos)
		end_loss = loss_fct(end_logits, end_pos)
		loss = (start_loss + end_loss) / <span class="hljs-number" style="color: rgb(136, 0, 0);">2</span>
		<span class="hljs-keyword" style="color: rgb(0, 0, 255);">return</span> loss
</code></pre></details>

------

## **后记**

本文作为系列的最后一篇文章，详细地介绍了BERT下游任务，BERT的通用性就体现在只需要添加少量模块就能应用到各种不同的下游任务。

BERT充分地利用了主模型输出的标记表示和序列表示，并对其进行一定地修改，从而可以应用到各种不同的下游任务中。
其中应用到选择题和问答任务的方式特别巧妙，分别活用了序列和标记表示。

然而，如同预训练，标记分类任务每个标记的标签是独立产生的，以及问答任务的起始和结束位置也是独立产生的，这其实不是非常合理。

------

标签: [Transformer](https://www.cnblogs.com/wangzb96/tag/Transformer/) , [PyTorch](https://www.cnblogs.com/wangzb96/tag/PyTorch/) , [Python](https://www.cnblogs.com/wangzb96/tag/Python/) , [BERT](https://www.cnblogs.com/wangzb96/tag/BERT/) , [深度学习](https://www.cnblogs.com/wangzb96/tag/深度学习/) , [深度语言表示](https://www.cnblogs.com/wangzb96/tag/深度语言表示/) , [自然语言处理（NLP）](https://www.cnblogs.com/wangzb96/tag/自然语言处理（NLP）/)