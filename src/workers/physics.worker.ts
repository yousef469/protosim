import RAPIER from '@dimforge/rapier3d-compat';

interface BodyDef {
  id: string;
  type: 'dynamic' | 'static';
  shape: 'box' | 'sphere' | 'cylinder' | 'capsule' | 'convexHull';
  mass: number;
  friction: number;
  restitution: number;
  position: { x: number; y: number; z: number };
  dimensions?: { x: number; y: number; z: number };
  radius?: number;
  height?: number;
  vertices?: number[];
  noSelfCollide?: number;  // collision group — bodies with same value won't collide with each other
}

interface JointDef {
  bodyId1: string;
  bodyId2: string;
  jointType: 'fixed' | 'revolute';
  anchor: { x: number; y: number; z: number };
  axis?: { x: number; y: number; z: number };
}

interface ForceDef {
  bodyId: string;
  force: { x: number; y: number; z: number };
}

interface TorqueDef {
  bodyId: string;
  torque: { x: number; y: number; z: number };
}

let world: RAPIER.World | null = null;
const bodies = new Map<string, RAPIER.RigidBody>();
const bodyDefs = new Map<string, BodyDef>();
let initialized = false;

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init':
      await RAPIER.init();
      world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      initialized = true;
      addGround();
      self.postMessage({ type: 'ready' });
      break;

    case 'add_body':
      if (world) addBody(msg.data as BodyDef);
      break;

    case 'remove_body':
      if (world) removeBody(msg.data.id);
      break;

    case 'apply_force':
      if (world) applyForce(msg.data as ForceDef);
      break;

    case 'apply_torque':
      if (world) applyTorque(msg.data as TorqueDef);
      break;

    case 'create_joint':
      if (world) createJoint(msg.data as JointDef);
      break;

    case 'step':
      if (world) step();
      break;

    case 'set_body_transform':
      if (world) setBodyTransform(msg.data);
      break;
    case 'reset':
      if (world) reset();
      break;
  }
};

function addGround() {
  if (!world) return;
  const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0);
  const body = world.createRigidBody(desc);
  const collider = RAPIER.ColliderDesc.cuboid(50, 0.5, 50);
  world.createCollider(collider, body);
  bodies.set('ground', body);
}

function addBody(def: BodyDef) {
  if (!world) return;

  let desc: RAPIER.RigidBodyDesc;
  if (def.type === 'static') {
    desc = RAPIER.RigidBodyDesc.fixed();
  } else {
    desc = RAPIER.RigidBodyDesc.dynamic();
    desc.linearDamping = 0.5;
    desc.angularDamping = 0.5;
  }

  desc = desc.setTranslation(def.position.x, def.position.y, def.position.z);

  const body = world.createRigidBody(desc);

  if (def.type === 'dynamic') {
    body.setAdditionalMass(def.mass, true);
  }

  let colliderDesc: RAPIER.ColliderDesc;
  switch (def.shape) {
    case 'box': {
      const d = def.dimensions || { x: 1, y: 1, z: 1 };
      colliderDesc = RAPIER.ColliderDesc.cuboid(d.x / 2, d.y / 2, d.z / 2);
      break;
    }
    case 'sphere':
      colliderDesc = RAPIER.ColliderDesc.ball(def.radius || 0.5);
      break;
    case 'cylinder':
      colliderDesc = RAPIER.ColliderDesc.cylinder(
        (def.height || 1) / 2,
        def.radius || 0.5
      );
      break;
    case 'capsule':
      colliderDesc = RAPIER.ColliderDesc.capsule(
        (def.height || 1) / 2,
        def.radius || 0.5
      );
      break;
    case 'convexHull':
      if (def.vertices && def.vertices.length >= 9) {
        const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(def.vertices));
        if (hull) {
          colliderDesc = hull;
          break;
        }
      }
      colliderDesc = RAPIER.ColliderDesc.cuboid(0.4, 0.4, 0.4);
      break;
    default:
      return;
  }

  colliderDesc
    .setFriction(def.friction)
    .setRestitution(def.restitution);

  if (def.noSelfCollide !== undefined) {
    const gid = 1 << def.noSelfCollide;
    const mask = 0xFFFF ^ gid;
    colliderDesc.setCollisionGroups(mask << 16 | gid);
  }

  world.createCollider(colliderDesc, body);
  bodies.set(def.id, body);
  bodyDefs.set(def.id, def);
}

function removeBody(id: string) {
  if (!world) return;
  const body = bodies.get(id);
  if (body && id !== 'ground') {
    world.removeRigidBody(body);
    bodies.delete(id);
    bodyDefs.delete(id);
  }
}

function applyForce(def: ForceDef) {
  const body = bodies.get(def.bodyId);
  if (body) {
    body.applyImpulse(def.force, true);
  }
}

function applyTorque(def: TorqueDef) {
  const body = bodies.get(def.bodyId);
  if (body) {
    body.applyTorqueImpulse(def.torque, true);
  }
}

function createJoint(def: JointDef) {
  if (!world) return;
  const b1 = bodies.get(def.bodyId1);
  const b2 = bodies.get(def.bodyId2);
  if (!b1 || !b2) return;

  const t1 = b1.translation();
  const t2 = b2.translation();

  const anchorLocal1 = {
    x: def.anchor.x - t1.x,
    y: def.anchor.y - t1.y,
    z: def.anchor.z - t1.z,
  };
  const anchorLocal2 = {
    x: def.anchor.x - t2.x,
    y: def.anchor.y - t2.y,
    z: def.anchor.z - t2.z,
  };

  let jointData: RAPIER.JointData;
  if (def.jointType === 'fixed') {
    jointData = RAPIER.JointData.fixed(
      anchorLocal1, { w: 1, x: 0, y: 0, z: 0 },
      anchorLocal2, { w: 1, x: 0, y: 0, z: 0 },
    );
  } else {
    const axis = def.axis || { x: 1, y: 0, z: 0 };
    jointData = RAPIER.JointData.revolute(
      anchorLocal1,
      anchorLocal2,
      axis,
    );
  }

  world.createImpulseJoint(jointData, b1, b2, true);
}

function step() {
  if (!world) return;
  world.step();

  const states: Array<{
    id: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    velocity: { x: number; y: number; z: number };
    angularVelocity: { x: number; y: number; z: number };
  }> = [];

  for (const [id, body] of bodies) {
    if (id === 'ground') continue;
    const t = body.translation();
    const r = body.rotation();
    const v = body.linvel();
    const av = body.angvel();
    states.push({
      id,
      position: { x: t.x, y: t.y, z: t.z },
      rotation: { x: r.x, y: r.y, z: r.z, w: r.w },
      velocity: { x: v.x, y: v.y, z: v.z },
      angularVelocity: { x: av.x, y: av.y, z: av.z },
    });
  }

  self.postMessage({ type: 'physics_state', data: { bodies: states } });
}

function setBodyTransform(data: { id: string; position: { x: number; y: number; z: number } }) {
  const body = bodies.get(data.id);
  if (body) {
    body.setTranslation(data.position, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}

function reset() {
  if (!world) return;
  const idsToRemove: string[] = [];
  for (const [id] of bodies) {
    if (id !== 'ground') idsToRemove.push(id);
  }
  for (const id of idsToRemove) {
    const body = bodies.get(id);
    if (body) world.removeRigidBody(body);
    bodies.delete(id);
    bodyDefs.delete(id);
  }
}
