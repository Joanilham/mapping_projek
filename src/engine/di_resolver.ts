import { CodeNode, CodeEdge, RelationType } from '../types/index.js';

export class DependencyInjectionResolver {
  private projectSlug: string;

  constructor(projectSlug: string) {
    this.projectSlug = projectSlug;
  }

  /**
   * Menjalankan resolusi lintas-file (cross-file resolution) untuk DI, Interface, dan Call Graph.
   */
  public resolve(nodes: CodeNode[], edges: CodeEdge[]): { nodes: CodeNode[]; edges: CodeEdge[] } {
    const resolvedEdges: CodeEdge[] = [...edges];

    // 1. Indeks seluruh Interface & Class berdasarkan nama simbol dan ID
    const interfacesByName = new Map<string, CodeNode>();
    const classesByName = new Map<string, CodeNode>();
    const methodsByClassAndName = new Map<string, CodeNode>(); // key: "ClassName.methodName"

    for (const node of nodes) {
      if (node.node_type === 'interface') {
        interfacesByName.set(node.name, node);
      } else if (node.node_type === 'class') {
        classesByName.set(node.name, node);
      } else if (node.node_type === 'method') {
        methodsByClassAndName.set(node.name, node);
      }
    }

    // 2. Petakan Interface/Token -> Daftar Class Konkret yang mengimplementasikannya
    // Key: Interface Name atau Interface Node ID, Value: Array of Class CodeNodes
    const interfaceImplementations = new Map<string, CodeNode[]>();

    for (const edge of edges) {
      if ((edge.relation_type as string) === 'IMPLEMENTS') {
        const classNode = nodes.find(n => n.id === edge.source_id);
        const ifaceName = edge.metadata?.interfaceName || edge.target_id;
        const ifaceNode = interfacesByName.get(ifaceName);

        if (classNode) {
          // Normalisasi target_id pada edge IMPLEMENTS ke ID node interface asli jika ditemukan
          if (ifaceNode) {
            edge.target_id = ifaceNode.id;
          }

          const list = interfaceImplementations.get(ifaceName) || [];
          list.push(classNode);
          interfaceImplementations.set(ifaceName, list);

          // Buat edge RESOLVES_TO dari Interface ke Class Implementasi
          const sourceId = ifaceNode ? ifaceNode.id : ifaceName;
          resolvedEdges.push({
            id: `${this.projectSlug}:${sourceId}:${classNode.id}:RESOLVES_TO`,
            project_slug: this.projectSlug,
            source_id: sourceId,
            target_id: classNode.id,
            relation_type: 'RESOLVES_TO' as RelationType,
            metadata: { resolutionStrategy: 'implements_clause' }
          });
        }
      }
    }

    // Fallback Heuristik Penamaan (jika developer tidak menulis `implements IOrderService`,
    // tetapi ada `IOrderService` dan `OrderService` / `SqlOrderService`)
    for (const [ifaceName, ifaceNode] of interfacesByName.entries()) {
      if (!interfaceImplementations.has(ifaceName) && /^I[A-Z]/.test(ifaceName)) {
        const baseName = ifaceName.slice(1); // "IOrderRepository" -> "OrderRepository"
        const matchingClasses: CodeNode[] = [];

        for (const [clsName, clsNode] of classesByName.entries()) {
          if (clsName === baseName || clsName.endsWith(baseName)) {
            matchingClasses.push(clsNode);
          }
        }

        if (matchingClasses.length > 0) {
          interfaceImplementations.set(ifaceName, matchingClasses);
          for (const clsNode of matchingClasses) {
            resolvedEdges.push({
              id: `${this.projectSlug}:${ifaceNode.id}:${clsNode.id}:RESOLVES_TO`,
              project_slug: this.projectSlug,
              source_id: ifaceNode.id,
              target_id: clsNode.id,
              relation_type: 'RESOLVES_TO' as RelationType,
              metadata: { resolutionStrategy: 'naming_convention_heuristic' }
            });
          }
        }
      }
    }

    // 3. Petakan Property Class yang di-inject:
    // Key: `${classNodeId}:${propertyName}` (contoh: "proj:file.ts:class:OrderController:orderRepo")
    // Value: Array dari Concrete Class Nodes yang merepresentasikan property tersebut
    const injectedPropertyMap = new Map<string, CodeNode[]>();

    for (const edge of edges) {
      if ((edge.relation_type as string) === 'INJECTS') {
        const ownerClassId = edge.source_id;
        const propName = edge.metadata?.propertyName;
        const token = edge.metadata?.token;

        if (!propName || !token) continue;

        const concreteTargets: CodeNode[] = [];

        // Cek apakah token adalah Interface yang punya implementasi konkret
        if (interfaceImplementations.has(token)) {
          concreteTargets.push(...interfaceImplementations.get(token)!);
        }
        // Cek apakah token langsung menunjuk ke Class konkret (misal: `private orderService: OrderService`)
        else if (classesByName.has(token)) {
          concreteTargets.push(classesByName.get(token)!);
        }

        if (concreteTargets.length > 0) {
          injectedPropertyMap.set(`${ownerClassId}:${propName}`, concreteTargets);
        }
      }
    }

    // 4. Sambungkan ulang edge `CALLS` yang memanggil `this.<injectedProp>.<methodName>()`
    for (const edge of resolvedEdges) {
      if (edge.relation_type !== 'CALLS') continue;

      const calleeName: string = edge.metadata?.calleeName || edge.target_id;
      if (!calleeName.startsWith('this.')) continue;

      // Contoh calleeName: "this.orderRepo.save"
      const parts = calleeName.split('.');
      if (parts.length < 3) continue;

      const propName = parts[1]; // "orderRepo"
      const methodName = parts[2]; // "save"

      // Cari tahu method pemanggil ini milik class mana
      const callerNode = nodes.find(n => n.id === edge.source_id);
      if (!callerNode || callerNode.node_type !== 'method') continue;

      const callerClassName = callerNode.name.split('.')[0];
      const callerClassNode = classesByName.get(callerClassName);
      if (!callerClassNode) continue;

      const lookupKey = `${callerClassNode.id}:${propName}`;
      const targetClasses = injectedPropertyMap.get(lookupKey);

      if (targetClasses && targetClasses.length > 0) {
        // Hubungkan panggilan ke method pada class konkret pertama, dan buat edge tambahan jika polimorfik
        targetClasses.forEach((targetCls, idx) => {
          const targetMethodNode = methodsByClassAndName.get(`${targetCls.name}.${methodName}`);
          if (targetMethodNode) {
            if (idx === 0) {
              // Update edge utama agar mengarah ke ID Node Method yang sebenarnya
              edge.target_id = targetMethodNode.id;
              edge.metadata = {
                ...edge.metadata,
                resolvedViaDI: true,
                resolvedClass: targetCls.name
              };
            } else {
              // Jika ada lebih dari 1 implementasi (misal SqlOrderRepo & MongoOrderRepo), tambahkan cabang polimorfik
              resolvedEdges.push({
                id: `${edge.id}:poly:${targetCls.name}`,
                project_slug: this.projectSlug,
                source_id: edge.source_id,
                target_id: targetMethodNode.id,
                relation_type: 'CALLS',
                metadata: {
                  ...edge.metadata,
                  resolvedViaDI: true,
                  polymorphicVariant: targetCls.name
                }
              });
            }
          }
        });
      }
    }

    return { nodes, edges: resolvedEdges };
  }
}
