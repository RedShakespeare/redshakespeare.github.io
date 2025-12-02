# 背景介绍

NLP日常工作经验和论文解析，包含：预训练模型，文本表征，文本相似度，文本分类，多模态，知识蒸馏，词向量。

我觉得NLP是一个值得深耕的领域，所以希望可以不停的提升自己核心竞争力和自己的段位！

微信公众号：DASOU

## 深度学习自然语言处理

### Transformer

1. [史上最全Transformer面试题](./links/NLP_ability/深度学习自然语言处理/Transformer/史上最全Transformer面试题)
2. [答案解析(1)-史上最全Transformer面试题](./links/NLP_ability/深度学习自然语言处理/Transformer/答案解析—史上最全Transformer面试题：灵魂20问帮你彻底搞定Transformer) 
3. [Pytorch代码分析--如何让Bert在finetune小数据集时更“稳”一点](./links/NLP_ability/深度学习自然语言处理/Bert/Pytorch代码分析-如何让Bert在finetune小数据集时更“稳”一点)
4. [解决老大难问题-如何一行代码带你随心所欲重新初始化bert的某些参数(附Pytorch代码详细解读)](./links/NLP_ability/深度学习自然语言处理/Bert/解决老大难问题-如何一行代码带你随心所欲重新初始化bert的某些参数附Pytorch代码)
5. [3分钟从零解读Transformer的Encoder](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/Transformer/3%E5%88%86%E9%92%9F%E4%BB%8E%E9%9B%B6%E8%A7%A3%E8%AF%BBTransformer%E7%9A%84Encoder)
6. [原版Transformer的位置编码究竟有没有包含相对位置信息](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/Transformer/%E5%8E%9F%E7%89%88Transformer%E7%9A%84%E4%BD%8D%E7%BD%AE%E7%BC%96%E7%A0%81%E7%A9%B6%E7%AB%9F%E6%9C%89%E6%B2%A1%E6%9C%89%E5%8C%85%E5%90%AB%E7%9B%B8%E5%AF%B9%E4%BD%8D%E7%BD%AE%E4%BF%A1%E6%81%AF)
7. [BN踩坑记--谈一下Batch Normalization的优缺点和适用场景](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/Transformer/BN%E8%B8%A9%E5%9D%91%E8%AE%B0--%E8%B0%88%E4%B8%80%E4%B8%8BBatch%20Normalization%E7%9A%84%E4%BC%98%E7%BC%BA%E7%82%B9%E5%92%8C%E9%80%82%E7%94%A8%E5%9C%BA%E6%99%AF)
8. [谈一下相对位置编码](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/Transformer/%E8%B0%88%E4%B8%80%E4%B8%8B%E7%9B%B8%E5%AF%B9%E4%BD%8D%E7%BD%AE%E7%BC%96%E7%A0%81)
9. [NLP任务中-layer-norm比BatchNorm好在哪里](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/Transformer/NLP%E4%BB%BB%E5%8A%A1%E4%B8%AD-layer-norm%E6%AF%94BatchNorm%E5%A5%BD%E5%9C%A8%E5%93%AA%E9%87%8C)
10. [谈一谈Decoder模块](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/Transformer/%E8%B0%88%E4%B8%80%E8%B0%88Decoder%E6%A8%A1%E5%9D%97)
11. [Transformer的并行化](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/Transformer/Transformer%E7%9A%84%E5%B9%B6%E8%A1%8C%E5%8C%96)
12. [Transformer全部文章合辑](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/Transformer/%E7%AD%94%E6%A1%88%E5%90%88%E8%BE%91)
13. [RNN的梯度消失有什么与众不同的地方](./links/NLP_ability/深度学习自然语言处理/其他/RNN的梯度消失有什么与众不同的地方)
14. [VIT-如何将Transformer更好的应用到CV领域](./links/NLP_ability/深度学习自然语言处理/Transformer/VIT-如何将Transformer更好的应用到CV领域)

### Bert-基本知识

1. [FastBERT-CPU推理加速10倍](./links/NLP_ability/深度学习自然语言处理/Bert/FastBert)
6. [RoBERTa：更多更大更强](./links/NLP_ability/深度学习自然语言处理/Bert/RoBERTa)
7. [为什么Bert做不好无监督语义匹配](./links/NLP_ability/深度学习自然语言处理/Bert/为什么Bert做不好无监督语义匹配)
8. [UniLM:为Bert插上文本生成的翅膀](./links/NLP_ability/深度学习自然语言处理/Bert/UniLM)
9. [tBERT-BERT融合主题模型做文本匹配](./links/NLP_ability/深度学习自然语言处理/Bert/tBERT-BERT融合主题模型)
10. [XLNET模型从零解读](./links/NLP_ability/深度学习自然语言处理/Bert/XLNET). 
[如何在脱敏数据中使用BERT等预训练模型](./links/NLP_ability/深度学习自然语言处理/BERT/如何在脱敏数据中使用BERT等预训练模型)

### Bert-知识蒸馏

1. [什么是知识蒸馏](./links/NLP_ability/深度学习自然语言处理/模型蒸馏/什么是知识蒸馏)
2. [如何让 TextCNN 逼近 Bert](./links/NLP_ability/深度学习自然语言处理/模型蒸馏/bert2textcnn模型蒸馏)
3. [Bert蒸馏到简单网络lstm](./links/NLP_ability/深度学习自然语言处理/模型蒸馏/Bert蒸馏到简单网络lstm)
4. [PKD-Bert基于多层的知识蒸馏方式](./links/NLP_ability/深度学习自然语言处理/模型蒸馏/PKD-Bert基于多层的知识蒸馏方式)
5. [BERT-of-Theseus-模块压缩交替训练](./links/NLP_ability/深度学习自然语言处理/模型蒸馏/Theseus-模块压缩交替训练)
6. [tinybert-全方位蒸馏](./links/NLP_ability/深度学习自然语言处理/模型蒸馏/tinybert-全方位蒸馏)
7. [ALBERT：更小更少但并不快](./links/NLP_ability/深度学习自然语言处理/模型蒸馏/ALBERT-更小更少但并不快)
8. [BERT知识蒸馏代码解析-如何写好损失函数](./links/NLP_ability/深度学习自然语言处理/模型蒸馏/BERT知识蒸馏代码解析-如何写好损失函数)
9. [知识蒸馏综述万字长文](./links/NLP_ability/深度学习自然语言处理/模型蒸馏/知识蒸馏综述万字长文)

### 词向量-word embedding

1. [史上最全词向量面试题-Word2vec/fasttext/glove/Elmo](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/%E5%8F%B2%E4%B8%8A%E6%9C%80%E5%85%A8%E8%AF%8D%E5%90%91%E9%87%8F%E9%9D%A2%E8%AF%95%E9%A2%98%E6%A2%B3%E7%90%86)

- Word2vec

1. [Word2vec两种训练模型详细解读-一个词经过模型训练可以获得几个词向量](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/%E8%81%8A%E4%B8%80%E4%B8%8BWord2vec-%E6%A8%A1%E5%9E%8B%E7%AF%87)
2. [Word2vec两种优化方式细节详细解读](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/%E8%81%8A%E4%B8%80%E4%B8%8BWord2vec-%E8%AE%AD%E7%BB%83%E4%BC%98%E5%8C%96%E7%AF%87)
3. [Word2vec-负采样和层序softmax与原模型是否等价](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/word2vec%E4%B8%A4%E7%A7%8D%E4%BC%98%E5%8C%96%E6%96%B9%E5%BC%8F%E7%9A%84%E8%81%94%E7%B3%BB%E5%92%8C%E5%8C%BA%E5%88%AB)
4. [Word2vec为何需要二次采样以及相关细节详细解读](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/Word2vec%E4%B8%BA%E4%BB%80%E4%B9%88%E9%9C%80%E8%A6%81%E4%BA%8C%E6%AC%A1%E9%87%87%E6%A0%B7%EF%BC%9F)
5. [Word2vec的负采样](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/Word2vec%E7%9A%84%E8%B4%9F%E9%87%87%E6%A0%B7) 
6. [Word2vec模型究竟是如何获得词向量的](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/Word2vec%E6%A8%A1%E5%9E%8B%E7%A9%B6%E7%AB%9F%E6%98%AF%E5%A6%82%E4%BD%95%E8%8E%B7%E5%BE%97%E8%AF%8D%E5%90%91%E9%87%8F%E7%9A%84) 
7. [Word2vec训练参数的选定](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/Word2vec%E8%AE%AD%E7%BB%83%E5%8F%82%E6%95%B0%E7%9A%84%E9%80%89%E5%AE%9A) 
8. [CBOW和skip-gram相较而言，彼此相对适合哪些场景](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/CBOW%E5%92%8Cskip-gram%E7%9B%B8%E8%BE%83%E8%80%8C%E8%A8%80%EF%BC%8C%E5%BD%BC%E6%AD%A4%E7%9B%B8%E5%AF%B9%E9%80%82%E5%90%88%E5%93%AA%E4%BA%9B%E5%9C%BA%E6%99%AF) 

- Fasttext/Glove

1. [Fasttext详解解读(1)-文本分类](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/Fasttext%E8%A7%A3%E8%AF%BB1)
2. [Fasttext详解解读(2)-训练词向量](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/Fasttext%E8%A7%A3%E8%AF%BB2)
3. [GLove细节详细解读](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E8%AF%8D%E5%90%91%E9%87%8F/%E8%81%8A%E4%B8%80%E4%B8%8BGlove) 

### 多模态

1. [多模态之ViLBERT：双流网络，各自为王](./links/NLP_ability/深度学习自然语言处理/多模态/多模态之ViLBERT：双流网络，各自为王)
2. [复盘多模态任务落地的六大问题](./links/NLP_ability/深度学习自然语言处理/多模态/复盘多模态需要解决的6个问题)
3. [如何将多模态数据融入到BERT架构中-多模态BERT的两类预训练任务](./links/NLP_ability/深度学习自然语言处理/多模态/如何将多模态数据融入到BERT架构中-多模态BERT的两类预训练任务)
1. [层次分类体系的必要性-多模态讲解系列(1)](./links/NLP_ability/深度学习自然语言处理/多模态/层次分类体系的必要性-多模态讲解系列)
2. [文本和图像特征表示模块详解-多模态讲解系列(2)](深度学习自然语言处理/多模态/文本和图像特征表示模块详解-多模态讲解系列) 
7. [多模态中各种Fusion方式汇总](./links/NLP_ability/深度学习自然语言处理/多模态/多模态中各种Fusion方式汇总 ) 


###  句向量-sentence embedding


1. [句向量模型综述](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E5%8F%A5%E5%90%91%E9%87%8F/%E5%8F%A5%E5%90%91%E9%87%8F%E6%A8%A1%E5%9E%8B%E7%BB%BC%E8%BF%B0) 


### 文本相似度

1. [五千字全面梳理文本相似度/文本匹配模型](./links/NLP_ability/深度学习自然语言处理/文本匹配和文本相似度/五千字全面梳理文本相似度和文本匹配模型)
2. [如何又好又快的做文本匹配-ESIM模型](./links/NLP_ability/深度学习自然语言处理/文本匹配和文本相似度/ESIM)
3. [阿里RE2-将残差连接和文本匹配模型融合](./links/NLP_ability/深度学习自然语言处理/文本匹配和文本相似度/阿里RE2-将残差连接和文本匹配模型融合)
4. [聊一下孪生网络和DSSM的混淆点以及向量召回的一个细节](./links/NLP_ability/深度学习自然语言处理/文本匹配和文本相似度/聊一下孪生网络和DSSM的混淆点以及向量召回的一个细节)
5. [DSSM论文-公司实战文章](./links/NLP_ability/深度学习自然语言处理/文本匹配和文本相似度/DSSM论文-公司实战文章)
6. [bert白化简单的梳理:公式推导+PCA&SVD+代码解读](./links/NLP_ability/深度学习自然语言处理/文本匹配和文本相似度/bert白化简单的梳理)
7. [SIMCSE论文解析](./links/NLP_ability/深度学习自然语言处理/文本匹配和文本相似度/SIMCSE论文解析)


###  关键词提取

1. [基于词典的正向/逆向最大匹配](./links/NLP_ability/深度学习自然语言处理/关键词提取/中文分词/基于词典的正向最大匹配和逆向最大匹配中文分词)
2. [实体库构建：大规模离线新词实体挖掘](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E5%85%B3%E9%94%AE%E8%AF%8D%E6%8F%90%E5%8F%96/%E5%AE%9E%E4%BD%93%E5%BA%93%E6%9E%84%E5%BB%BA%EF%BC%9A%E5%A4%A7%E8%A7%84%E6%A8%A1%E7%A6%BB%E7%BA%BF%E6%96%B0%E8%AF%8D%E5%AE%9E%E4%BD%93%E6%8C%96%E6%8E%98)
3. [聊一聊NLPer如何做关键词抽取](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E5%85%B3%E9%94%AE%E8%AF%8D%E6%8F%90%E5%8F%96/%E5%85%B3%E9%94%AE%E8%AF%8D%E6%8F%90%E5%8F%96%E6%96%B9%E6%B3%95%E7%BB%BC%E8%BF%B0)

###  命名体识别

1. [命名体识别资源梳理(代码+博客讲解)](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E5%91%BD%E5%90%8D%E4%BD%93%E8%AF%86%E5%88%AB/%E5%91%BD%E5%90%8D%E4%BD%93%E8%AF%86%E5%88%AB%E8%B5%84%E6%BA%90%E6%A2%B3%E7%90%86%E4%BB%A3%E7%A0%81%2B%E5%8D%9A%E5%AE%A2%E8%AE%B2%E8%A7%A3)
2. [HMM/CRF 详细解读](./links/NLP_ability/深度学习自然语言处理/命名体识别/HMM_CRF) 
3. [工业级命名体识别的做法](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E5%91%BD%E5%90%8D%E4%BD%93%E8%AF%86%E5%88%AB/%E5%B7%A5%E4%B8%9A%E7%BA%A7%E5%91%BD%E5%90%8D%E4%BD%93%E8%AF%86%E5%88%AB%E7%9A%84%E5%81%9A%E6%B3%95)     
4. [词典匹配+模型预测-实体识别两大法宝](./links/NLP_ability/%E6%B7%B1%E5%BA%A6%E5%AD%A6%E4%B9%A0%E8%87%AA%E7%84%B6%E8%AF%AD%E8%A8%80%E5%A4%84%E7%90%86/%E5%91%BD%E5%90%8D%E4%BD%93%E8%AF%86%E5%88%AB/%E8%AF%8D%E5%85%B8%E5%8C%B9%E9%85%8D%2B%E6%A8%A1%E5%9E%8B%E9%A2%84%E6%B5%8B-%E5%AE%9E%E4%BD%93%E8%AF%86%E5%88%AB%E4%B8%A4%E5%A4%A7%E6%B3%95%E5%AE%9D)

5. [autoner+fuzzy-CRF-使用领域词典做命名体识别](./links/NLP_ability/深度学习自然语言处理/命名体识别/autoner)

6. [FLAT-Transformer-词典+Transformer融合词汇信息](./links/NLP_ability/深度学习自然语言处理/命名体识别/FLAT-Transformer)--公众号

7. [TENER-复旦为什么TRM在NER上效果差](./links/NLP_ability/深度学习自然语言处理/命名体识别/TNER-复旦为什么TRM在NER上效果差)

###  文本分类

1. [TextCNN论文详细解读](./links/NLP_ability/深度学习自然语言处理/文本分类/CNN文本分类解读) 
2. [只使用标签名称就可以文本分类 ](./links/NLP_ability/深度学习自然语言处理/文本分类/只使用标签名称就可以文本分类 )
3. [半监督入门思想之伪标签](./links/NLP_ability/深度学习自然语言处理/文本分类/半监督入门思想之伪标签)
4. [ACL2020-多任务负监督方式增加CLS表达差异性](./links/NLP_ability/深度学习自然语言处理/文本分类/ACL2020-多任务负监督方式增加CLS表达差异性)
5. [Bert在文本分类任务上微调](./links/NLP_ability/深度学习自然语言处理/文本分类/在文本分类上微调Bert)
6. [UDA-Unsupervised Data Augmentation for Consistency Training-半监督集大成](./links/NLP_ability/深度学习自然语言处理/文本分类/UDA)
7. [LCM-缓解标签不独立以及标注错误的问题](./links/NLP_ability/深度学习自然语言处理/文本分类/LCM-缓解标签不独立以及标注错误的问题)
8. [关键词信息如何融入到文本分类任务中](./links/NLP_ability/深度学习自然语言处理/文本分类/关键词信息如何融入到文本分类任务中)

### 对比学习

1. [Moco论文解析](./links/NLP_ability/深度学习自然语言处理/对比学习/Moco1论文解析)
