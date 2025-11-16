import { CatmullRomSpline } from "./Helpers/CatmullRomSpline";
import {GetVectorsFromQuaternion} from "./Helpers/GetVectorsFromQuaternion";
import { LensInitializer } from "./LensInitializer";

interface SpawnedArrowData {
    pointPosition: vec3;
    objects: SceneObject[];
    id: number
}

// we have a single arrows spawner in the scene
// the arrows are spawned along the path at given positions using a prefab at left and right side of the path
// we limit the number of arrows spawned at a time to save performance
// as player moves forward along the path, we despawn the oldest arrows and spawn new ones ahead
// we also want to compute whenever there is a big turn in the path to spwawn danger arrows opposite to the turn direction and some distance ahead of the player (not implemented yet)

@component
export class ArrowsSpawner extends BaseScriptComponent {

    @input
    private mainCamera: Camera;
    private mainCameraT: Transform;

    @input
    private maxArrows: number;

    @input
    private revealDistance: number = 1000;

    @input
    private minimalDistanceBetweenArrows: number = 100;

    @input
    private pfbSideArrow: ObjectPrefab;
    
    @input
    private pfbDanger: ObjectPrefab;

    @input
    private arrowMaterial: Material

    // angle in degrees above which we consider a turn "sharp"
    @input
    private sharpTurnAngle: number = 30;

    // how far ahead (world units) to spawn the danger marker from the current point when a sharp turn is detected
    @input
    private dangerAheadDistance: number = 300;

    private updateEvent: SceneEvent;
    private positions: vec3[] = [];
    private spawnedArrows: SpawnedArrowData[] = [];
    private nextId: number;
    private vec3up: vec3 = vec3.up();
    private splinePoints:{position:vec3, rotation:quat}[] = [];
    private pathLength:number;

    start(arrowsPositions: vec3[], mySplinePoints:{position:vec3, rotation:quat}[], myPathLength:number){
        this.clearState();
        this.nextId = 0;

        this.splinePoints = mySplinePoints;
        this.pathLength = myPathLength;

        // clear some points from beginning and end
        const offset = 7;
        if(arrowsPositions.length > offset+1){
            arrowsPositions = arrowsPositions.slice(offset-1, arrowsPositions.length-1);
        }
        if(arrowsPositions.length > offset+1){
            arrowsPositions = arrowsPositions.slice(0,-offset);
        }

        this.positions = arrowsPositions;
        this.updateEvent.enabled = true;
    }

    stop(){
        this.updateEvent.enabled = false;
        this.clearState();
    }

    clearState(){
        this.spawnedArrows.forEach((i) => {
            i.objects.forEach((o) => {
                o.destroy();
            });
        })
        this.spawnedArrows = [];
    }

    onAwake(){
        this.updateEvent = this.createEvent("UpdateEvent");
        this.updateEvent.enabled = false;
        this.updateEvent.bind(() => {
            this.onUpdate();
        });
        this.mainCameraT = this.mainCamera.getTransform();
    }

    private onUpdate(){
        this.trySpawnNextArrows();
    }

    private getSpawnedArrowsCount(){
        return this.spawnedArrows.length;
    }

    private getArrowsLimit(){
        return this.maxArrows;
    }

    private tryGetNextArrowPositionAndRotation(){
        const currentOldest = this.tryGetOldestArrowPositionAndRotation();
        const currentOldestId = currentOldest ? currentOldest.id : -1;
        if (this.nextId < this.positions.length && this.nextId != currentOldestId){
            return this.positions[this.nextId];
        }
        return null;
    }

    private tryGetOldestArrowPositionAndRotation(){
        if (this.spawnedArrows.length){
            return this.spawnedArrows[0];
        }
        return null;
    }

    private removeOldestArrow(){
        if (this.spawnedArrows.length == 0){
            throw new Error("No arrows spawned");
        }
        this.spawnedArrows[0].objects.forEach((o) => o.destroy());
        this.spawnedArrows.shift();
    }

    private getDistanceOnSpline(posA:vec3, posB:vec3){
        let tA = CatmullRomSpline.worldToSplineSpace(posA, this.splinePoints).t;
        let tB = CatmullRomSpline.worldToSplineSpace(posB, this.splinePoints).t;
        let dist = Math.abs(tA-tB) * this.pathLength;
        return dist;
    }

    private incrementNextId(currentPosition: vec3){
        const currentOldest = this.tryGetOldestArrowPositionAndRotation();
        if (!currentOldest){
            throw new Error("Cannot increment next id. Current oldest is null. This potentially means that we tried to increment id before spawning the arrow");
        }
        const currentOldestId = currentOldest.id;
        while (this.nextId < this.positions.length && this.getDistanceOnSpline(this.positions[this.nextId], currentPosition) < this.minimalDistanceBetweenArrows) {
            this.nextId++;
            if (this.nextId >= this.positions.length){
                this.nextId = 0;
            }
            if (this.nextId == currentOldestId){
                break;
            }
        }
    }

    private spawnNextArrow(){
        if (this.nextId >= this.positions.length){
            throw new Error("No position to spawn next arrow");
        }
        let currentId = this.nextId;
        const currentPosition = this.positions[currentId];
        let posA:vec3 = null;
        let posB:vec3 = null;
        if(this.positions.length > currentId+1){
            posA = this.positions[currentId];
            posB = this.positions[currentId+1];
        }else{
            posA = this.positions[currentId-1];
            posB = this.positions[currentId];
        }
        let fwd = posB.sub(posA);
        fwd = fwd.normalize();

        let up = this.vec3up.projectOnPlane(fwd);
        up = up.normalize();
        let rot = quat.lookAt(fwd, up);

        const {leftArrow, rightArrow} = this.instantiateSideArrowObj(currentPosition, rot); // pass pos and rot

        // assemble objects for this spawn; by default left and right arrows
        const objectsArr: SceneObject[] = [leftArrow, rightArrow];

        // detect sharp turn and spawn danger marker on the opposite side of the turn
        try {
            const turnInfo = this.isSharpTurnAt(currentId);
            if (turnInfo.sharp && this.pfbDanger){
                // spawn danger on the opposite side of where the path is turning
                // turnInfo.sign: +1 = left turn, -1 = right turn
                // so we spawn on the opposite side: -sign
                const oppositeSideSign = turnInfo.sign === 0 ? 1 : -turnInfo.sign;
                const dangerObj = this.instantiateDangerAt(currentPosition, rot, oppositeSideSign);
                if (dangerObj) objectsArr.push(dangerObj);
            }
        } catch (e) {
            // ignore detection errors to avoid breaking arrow spawn
        }

        this.spawnedArrows.push({
            pointPosition: currentPosition,
            objects: objectsArr,
            id: currentId
        });

        this.incrementNextId(currentPosition);
    }

    private instantiateSideArrowObj( position:vec3, rotation:quat ){
        let radius = 120;
        let height = 45;

        const { forward, right, up } = GetVectorsFromQuaternion.getInstance().getVectorsFromQuaternion(rotation);
        let rightPos = position.add(right.uniformScale(radius)).add(up.uniformScale(height));
        let leftPos = position.add(right.uniformScale(-radius)).add(up.uniformScale(height));

        let rightRot = quat.angleAxis(Math.PI/3, forward).multiply(rotation);
        let leftRot = quat.angleAxis(-Math.PI/3, forward).multiply(rotation);

        let leftArrow = this.pfbSideArrow.instantiate(null);
        leftArrow.getTransform().setWorldPosition(rightPos);
        leftArrow.getTransform().setWorldRotation(rightRot);
        // Hack to aid artist need to see realtime material changes to spawned arrow
        leftArrow.getChild(0).getChild(0).getComponent("RenderMeshVisual").mainMaterial = this.arrowMaterial;

        let rightArrow = this.pfbSideArrow.instantiate(null);
        rightArrow.getTransform().setWorldPosition(leftPos);
        rightArrow.getTransform().setWorldRotation(leftRot);
        // Hack to aid artist need to see realtime material changes to spawned arrow
        rightArrow.getChild(0).getChild(0).getComponent("RenderMeshVisual").mainMaterial = this.arrowMaterial;

        return {leftArrow, rightArrow};
    }

    // returns whether there is a sharp turn at `index` using a wider lookahead window
    private isSharpTurnAt(index: number){
        // return { sharp: true, angleDeg: 45, sign: 1 }; // --- IGNORE ---
        if (!this.positions || this.positions.length < 3){
            return { sharp: false, angleDeg: 0, sign: 0 };
        }
        const len = this.positions.length;
        
        // use a wider lookahead window (2 steps back, 2 steps forward) for more reliable detection
        const prevIndex = Math.max(0, index - 2);
        const nextIndex = Math.min(len - 1, index + 2);

        const prevPos = this.positions[prevIndex];
        const curPos = this.positions[index];
        const nextPos = this.positions[nextIndex];

        let vA = curPos.sub(prevPos);
        let vB = nextPos.sub(curPos);

        // project onto horizontal plane (ignore vertical changes for turn detection)
        vA.y = 0;
        vB.y = 0;

        if (vA.length === 0 || vB.length === 0){
            return { sharp: false, angleDeg: 0, sign: 0 };
        }

        vA = vA.normalize();
        vB = vB.normalize();

        // signed angle via cross.y and dot
        const dot = Math.max(-1, Math.min(1, vA.dot(vB)));
        const angleRad = Math.acos(dot);
        const angleDeg = angleRad * (180 / Math.PI);

        const cross = vA.cross(vB);
        const sign = Math.sign(cross.y || 0); // +1 left, -1 right (assuming Y-up)

        return { sharp: Math.abs(angleDeg) >= this.sharpTurnAngle, angleDeg, sign };
    }

    // instantiate the pfbDanger object at a position offset opposite to the turn sign
    private instantiateDangerAt(basePosition: vec3, rotation: quat, sideSign: number){
        if (!this.pfbDanger) return null;

        const radius = -200;
        const height = 45;

        const { forward, right, up } = GetVectorsFromQuaternion.getInstance().getVectorsFromQuaternion(rotation);

        // sideSign: +1 means we should offset to the right side; to spawn opposite of turn we pass opposite sign
        const sideOffset = forward.uniformScale(radius * sideSign);
        const heightOffset = up.uniformScale(height);

        const spawnPos = basePosition.add(sideOffset).add(heightOffset);

        const dangerObj = this.pfbDanger.instantiate(null);
        dangerObj.getTransform().setWorldPosition(spawnPos);
        // make it face same general forward direction
        dangerObj.getTransform().setWorldRotation(rotation);

        return dangerObj;
    }

    private trySpawnNextArrows(){
        const currentPosition = LensInitializer.getInstance().getPlayerGroundPos();
        const spawnedArrowsCount = this.getSpawnedArrowsCount();
        const limit = this.getArrowsLimit();
        if (spawnedArrowsCount >= limit){
            const nextArrow = this.tryGetNextArrowPositionAndRotation();
            if (isNull(nextArrow)){
                return;
            }
            const oldestArrow = this.tryGetOldestArrowPositionAndRotation();
            const toNext = this.getDistanceOnSpline(nextArrow, currentPosition);
            const toOldest = oldestArrow ? this.getDistanceOnSpline(oldestArrow.pointPosition, currentPosition) : Infinity;
            if (toNext < toOldest && toNext < this.revealDistance){
                this.removeOldestArrow();
                this.spawnNextArrow();
            }
        } else {
            const canSpawn = limit - spawnedArrowsCount;
            for (let i = 0; i < canSpawn; i++){
                const nextArrow = this.tryGetNextArrowPositionAndRotation();
                if (isNull(nextArrow)){
                    break;
                }
                this.spawnNextArrow();
            }
        }
    }
}
