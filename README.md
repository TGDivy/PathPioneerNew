# YourWalk  
*A calm, spatial companion for safer late-night walks.*

YourWalk is an AR experience built for **Snap Spectacles** at **Hack Junction 2025** (Snap Track).  
It supports anyone who feels uneasy during evening walks by offering gentle guidance, safety awareness, and a sense of presence.

[![Watch the demo](https://img.youtube.com/vi/f2F2XJi3su0/maxresdefault.jpg)](https://www.youtube.com/watch?v=f2F2XJi3su0)

---

## 🌙 Overview

Many people experience stress when walking alone at night.  
YourWalk responds to this reality with care.

The system uses **on-device perception**, **AI agents**, and **environmental data** to suggest safer routes, surface local risk cues, and provide a quiet form of companionship.

YourWalk aims to make every step feel a little more confident.

---

## ✨ Core Features

### **1. Real-Time Risk Awareness**
YourWalk scores the area surrounding the user—up to a ~200m radius—using:

- Public crime datasets  
- Public transport stops & traffic density  
- Pedestrian activity  
- Lighting levels  
- Position & heading from Snap Spectacles  

The result is a **dynamic risk map** rendered through simple, readable AR cues.

### **2. Safe Route Guidance**
YourWalk proposes paths that reduce exposure to higher-risk zones.  
Through audio + visual cues, users quickly understand:

- Safer directions to walk  
- Nearby secure or populated locations  
- How the environment changes over time

### **3. Supportive AI Conversation**
A lightweight conversational agent offers:

- Short grounding talks during quiet moments  
- A sense of social presence (which can reduce unwanted attention)  
- Quick access to “trusted places” when requested

This transforms the experience from purely navigational to genuinely comforting.

---

## 🛠️ Tech Stack

**Hardware:**  
- Snap Spectacles (Snap AR Runtime)

**Software:**  
- Lens Studio  
- SnapML / On-device inference  
- Python backend for scoring & data aggregation  
- Lightweight risk engine combining multiple public datasets  
- Realtime communication layer for position → score → route updates

**AI:**  
- Small agentic pipeline for context adaptation  
- Behavior models for conversational support  
- Routing logic tuned for minimizing risk zones

---

## 🧠 How It Works (High-Level)

1. **Data ingestion** – fetch crime reports, lighting, transit nodes, and time-of-day modifiers.  
2. **Risk scoring** – compute a weighted score per micro-zone (~200m) around the user.  
3. **Position tracking** – pull real-time pose & direction from Spectacles.  
4. **Routing** – generate a path that minimizes exposure while remaining natural to follow.  
5. **AR cues** – render color-coded guidance, direction hints, and safety markers.  
6. **AI companion** – offer light conversation and quick access to safe places.

---

## 🚀 Why We Built This

Walking home at night should feel ordinary, not stressful.  
YourWalk is our attempt to blend **care, technology, and spatial awareness** into something that supports people quietly, without judgement or friction.

Built with love at **Hack Junction 2025**.

---

## 👥 Team

YourWalk was created by:

- Divy  
- (Add teammate names)  

---
