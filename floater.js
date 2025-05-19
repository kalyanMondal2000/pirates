import * as THREE from "./three/build/three.module.js";

export default class Floater {
    earth
    object
    gerstnerWater
    cogHelper
    velocityHelper
    waveNormalHelpers = []
    gravityHelpers = []
    gravitySlideHelpers = []
    floatPoints = []
    down = new THREE.Vector3(0, -1, 0)
    heading = 0
    power = 0
    isPlayerFloater = false
    collisionSphere
    //sphereMesh
    //boxHelper: THREE.Box3Helper
    lastPosition = new THREE.Vector3()
    velocity = new THREE.Vector3()
    ms = 0
    forces = []

    constructor(
        earth,
        object,
        gerstnerWater,
        isPlayerFloater = false
    ) {
        this.earth = earth
        this.object = object
        this.gerstnerWater = gerstnerWater
        this.isPlayerFloater = isPlayerFloater

        this.object.traverse((child) => {
            if (child.name.startsWith('floatPoint')) {
                this.floatPoints.push(child)
            }
        })
        if (!this.floatPoints.length) {
            //then create one in the middle that we can use
            const floatPoint = new THREE.Object3D()
            //floatPoint.name = 'floatPoint'
            this.object.add(floatPoint)
            this.floatPoints.push(floatPoint)
        }

        //;(this.object as THREE.Mesh).geometry.computeBoundingBox()
        const aabb = new THREE.Box3().setFromObject(this.object)
        this.collisionSphere = new THREE.Sphere()
        aabb.getBoundingSphere(this.collisionSphere)
        // this.sphereMesh = new THREE.Mesh(
        //     new THREE.SphereGeometry(this.collisionSphere.radius, 8, 8),
        //     new THREE.MeshBasicMaterial({
        //         color: 0xff0000,
        //         transparent: true,
        //         opacity: 0.25,
        //         visible: false,
        //     })
        // )
        // this.object.add(this.sphereMesh)

        //console.log(this.collisionSphere)

        //this.object.add(this.boxHelper)
        // Make all ArrowHelpers transparent
        this.object.traverse((child) => {
            if (child instanceof THREE.ArrowHelper) {
                child.material.transparent = true
                child.material.opacity = 0.00005
            }
        })

        this.cogHelper = new THREE.ArrowHelper(
            new THREE.Vector3(),
            new THREE.Vector3(),
            0.000000000001,
           0x000000
        )
        earth.add(this.cogHelper)

        this.velocityHelper = new THREE.ArrowHelper(
            new THREE.Vector3(),
            new THREE.Vector3(),
            0.000000000001,
            0x000000
        )
        earth.add(this.velocityHelper)

        this.floatPoints.forEach((fp) => {
            const waveNormalHelper = new THREE.ArrowHelper(
                new THREE.Vector3(),
                new THREE.Vector3(),
                0.00000000001,
                0x000000 
            )
            waveNormalHelper.position.copy(fp.position)
            this.waveNormalHelpers.push(waveNormalHelper)
            earth.add(waveNormalHelper)

            const gravitySlideHelper = new THREE.ArrowHelper(
                new THREE.Vector3(0, 1, 0),
                new THREE.Vector3(),
                0.00000000001,
               0x000000
            )
            gravitySlideHelper.position.copy(fp.position)
            this.gravitySlideHelpers.push(gravitySlideHelper)
            earth.add(gravitySlideHelper)
        })
    }

    //r = 0
    update(delta) {
        //this.boxHelper.updateMatrixWorld(true)

        const t = this.gerstnerWater.water.material.uniforms['time'].value

        const accumulatedPosition = new THREE.Vector3() // this.object.position.clone()

        const accumulatedNormal = new THREE.Vector3(0, 0, 0)

        this.floatPoints.forEach((fp, i) => {
            const fpWorldPos = new THREE.Vector3()

            fp.getWorldPosition(fpWorldPos)
            fpWorldPos.sub(this.earth.position)

            const waveInfo = this.gerstnerWater.getWaveInfo(
                this.object.position.x,
                this.object.position.z,
                fpWorldPos.x,
                fpWorldPos.z,
                t
            )

            this.waveNormalHelpers[i].setDirection(waveInfo.normal)
            this.waveNormalHelpers[i].position.copy(fpWorldPos)

            const gravitySlideDirection = new THREE.Vector3(0, -1, 0)
                .add(waveInfo.normal)
                .divideScalar(2)
                .normalize()

            this.gravitySlideHelpers[i].setDirection(gravitySlideDirection)
            this.gravitySlideHelpers[i].position.copy(fpWorldPos)

            accumulatedPosition.y += waveInfo.position.y
            accumulatedPosition.x += this.object.position.x + waveInfo.normal.x
            accumulatedPosition.z += this.object.position.z + waveInfo.normal.z

            accumulatedNormal.add(waveInfo.normal)
        })

        //average all floatPoints directions
        accumulatedPosition.divideScalar(this.floatPoints.length)

        //this.object.position.y = accumulatedPosition.y

        // //apply any forces
        if (this.forces.length) {
            this.forces.forEach((f) => {
                //console.log(f)
                //accumulatedPosition.add(new THREE.Vector3(f.x, f.y, f.z))
                accumulatedPosition.x += f.x
                accumulatedPosition.z += f.z
                //accumulatedPosition.sub(f)
            })
            this.forces = []
        }

        accumulatedPosition.x += Math.sin(this.heading) * this.power
        accumulatedPosition.z += Math.cos(this.heading) * this.power

        //console.log(this.object.position.x,accumulatedPosition.x)
        //this.object.position.copy(accumulatedPosition)//
        this.object.position.lerp(accumulatedPosition, 0.25)

        this.velocity = this.lastPosition.clone().sub(accumulatedPosition).negate()
        this.velocityHelper.setDirection(this.velocity)
        this.velocityHelper.position.set(
            accumulatedPosition.x,
            accumulatedPosition.y + 1,
            accumulatedPosition.z
        )

        const dist = accumulatedPosition.distanceTo(this.lastPosition)
        this.ms = dist * 1000 * delta
        this.velocityHelper.setLength(this.ms)
        this.lastPosition = accumulatedPosition

        this.collisionSphere.center.copy(this.object.position)

        accumulatedNormal.divideScalar(this.floatPoints.length).normalize()

        this.cogHelper.setDirection(accumulatedNormal)
        this.cogHelper.position.copy(accumulatedPosition)

        this.object.children[0].rotation.y = this.heading
        this.object.quaternion.rotateTowards(this.cogHelper.quaternion, delta * 0.2)

        if (this.isPlayerFloater) {
            this.gerstnerWater.water.position.x = -this.earth.position.x
            this.gerstnerWater.water.position.z = -this.earth.position.z
            this.gerstnerWater.water.material.uniforms['offsetX'].value =
                -this.earth.position.x
            this.gerstnerWater.water.material.uniforms['offsetZ'].value =
                -this.earth.position.z
        }
    }
}
