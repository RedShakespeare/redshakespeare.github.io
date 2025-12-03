---
title: Ephesus Roguelike Server 已上线！
date: 2025-12-3 16:32:23
tags:
  - 资源
  - roguelike
  - 服务器
  - dgamelaunch
---
最近租了一个便宜 ubuntu VPS，折腾 nethack.alt.org 开发者开源的 dgamelaunch 服务部署了一个纯 tty 的 rl 在线游玩服务器，支持注册用户游玩和观看他人游玩很多基于终端的传统rl。

服务器目前部署了以下游戏版本：
- Cataclysm DDA 0.F-2
- NetHack 3.6.7 中文版
- FrogComposband 7.1.salmiak
- FrogComposbandnet
- Dwarf Fortress 0.47.05
- DoomRL 0.10.0
- Brogue CE 1.14.1 后的某个开发版
- Hydra Slayer v18.3
- Omega 0.80.2 C++ 移植版
- PRIME v2.5a （手动修复了按键bug）
- Sil-Q v1.5.0

可以通过以下方式连接服务器：
- ssh: rlfans@server.ephesus.top:15452
- telnet: server.ephesus.top:23, 111.229.130.78:23（1iuh 老哥转发的国内代理）
- 本页面：
<div style="width: 95%; max-width: 900px; height: 500px; border: 1px solid #ccc;">
  <iframe
    src="https://server.ephesus.top"
    style="width: 100%; height: 100%; border: 0;"
    referrerpolicy="no-referrer"
  ></iframe>
</div>

之后有空写一下具体的部署过程以及踩的坑。（不然隔一段时间忘了><）

