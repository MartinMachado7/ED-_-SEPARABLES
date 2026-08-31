// Importar componentes de Material Web
import './style.css';
import functionPlot from 'function-plot';
import Algebrite from 'algebrite';
import * as math from 'mathjs';

const fxyInput = document.getElementById('fxy-input');
const x0Input = document.getElementById('x0-input');
const y0Input = document.getElementById('y0-input');
const aInput = document.getElementById('a-input');
const bInput = document.getElementById('b-input');
const solveBtn = document.getElementById('solve-btn');
const stepsOutput = document.getElementById('steps-output');
const plotContainer = document.getElementById('plot');

function processDifferentialEquation() {
  stepsOutput.innerHTML = '';
  const exprRaw = fxyInput.value.trim();
  const x0 = parseFloat(x0Input.value);
  const y0 = parseFloat(y0Input.value);
  const a = parseFloat(aInput.value);
  const b = parseFloat(bInput.value);

  // --- 1 y 2. VALIDACIÓN DE SINTAXIS E INTERVALO ---
  if (!exprRaw) {
    showError('Sintaxis inválida: Debes ingresar una expresión F(x,y).');
    return;
  }
  if (isNaN(x0) || isNaN(y0)) {
    showError('Condición inicial inválida: x0 y y0 deben ser números reales.');
    return;
  }
  if (isNaN(a) || isNaN(b) || a >= b) {
    showError('Intervalo gráfico inválido: Se requiere que a < b.');
    return;
  }
  if (x0 < a || x0 > b) {
    showError(`Dominio fuera de rango: La condición inicial x0 = ${x0} debe pertenecer al intervalo [${a}, ${b}].`);
    return;
  }

  try {
    // --- 3. SIMPLIFICACIÓN Y FACTORIZACIÓN ---
    const factoredExpr = Algebrite.run(`factor(${exprRaw})`).toString();
    addStep('1. Simplificación y Factorización', `F(x, y) factorizada: <code>${factoredExpr}</code>`);

    // --- 4. CLASIFICACIÓN DE SEPARABILIDAD F(x,y) = g(x)*h(y) ---
    const testY1 = Algebrite.run(`subst(1, y, ${factoredExpr})`).toString();
    const gx = testY1;
    const hy = Algebrite.run(`simplify((${factoredExpr}) / (${gx}))`).toString();

    const hyHasX = Algebrite.run(`has(${hy}, x)`).toString();
    const gxHasY = Algebrite.run(`has(${gx}, y)`).toString();

    if (hyHasX === '1' || gxHasY === '1' || gx === '0' || hy === '0' || hy.includes('Stop:') || gx.includes('Stop:')) {
      showError('Ecuación No Separable: No se encontró una descomposición válida F(x, y) = g(x) · h(y).');
      return;
    }

    addStep('2. Clasificación de Separabilidad', `
      Es separable con:<br>
      • <code>g(x) = ${gx}</code> (depende solo de x)<br>
      • <code>h(y) = ${hy}</code> (depende solo de y)
    `);

    // --- 5. SOLUCIONES CONSTANTES h(y) = 0 ---
    let constRoots = Algebrite.run(`roots(${hy}, y)`).toString();
    if (constRoots.includes('Stop:')) {
      constRoots = 'No se pudieron calcular analíticamente o no existen soluciones polinómicas';
    }

    addStep('3. Soluciones Constantes', `
      Resolviendo h(y) = 0:<br>
      Soluciones de equilibrio: <code>y = ${constRoots}</code>
    `);

    // --- 6. SEPARACIÓN DE VARIABLES ---
    addStep('4. Separación de Variables e Integrales', `
      Forma separada:<br>
      <code>(1 / (${hy})) dy = (${gx}) dx</code><br><br>
      Integrales a resolver:<br>
      <code>∫ (1 / (${hy})) dy = ∫ (${gx}) dx</code>
    `);

    // --- 7. SOLUCIÓN GENERAL ---
    const intH = Algebrite.integral(Algebrite.run(`1 / (${hy})`), Algebrite.run('y')).toString();
    const intG = Algebrite.integral(Algebrite.run(gx), Algebrite.run('x')).toString();

    addStep('5. Solución General (Implícita)', `
      <code>${intH} = ${intG} + C</code>
    `);

    // --- 8. SOLUCIÓN PARTICULAR ---
    const intH_at_y0 = Algebrite.run(`subst(${y0}, y, ${intH})`).toString();
    const intG_at_x0 = Algebrite.run(`subst(${x0}, x, ${intG})`).toString();
    const cVal = Algebrite.run(`simplify(${intH_at_y0} - (${intG_at_x0}))`).toString();
    
    // Convertir C a su valor numérico flotante para evitar fracciones simbólicas complejas
    const cValFloat = Algebrite.run(`float(${cVal})`).toString();
    const implicitEqWithC = `(${intH}) - (${intG}) - (${cValFloat})`;

    let rootsY = Algebrite.run(`roots(${implicitEqWithC}, y)`).toString();

    let fnExplicit = '';
    if (rootsY.includes('Stop:')) {
      fnExplicit = 'IMPLICIT_EQ';
    } else {
      fnExplicit = rootsY;
      if (fnExplicit.startsWith('[') && fnExplicit.endsWith(']')) {
        const candidates = fnExplicit.slice(1, -1).split(',');
        let selected = candidates[0].trim();
        
        for (let cand of candidates) {
          const valAtX0 = Algebrite.run(`subst(${x0}, x, ${cand.trim()})`).toString();
          if (Math.abs(parseFloat(valAtX0) - y0) < 0.001) {
            selected = cand.trim();
            break;
          }
        }
        fnExplicit = selected;
      }
    }

    addStep('6. Solución Particular', `
      Constante calculada: <code>C = ${cVal}</code><br>
      ${fnExplicit === 'IMPLICIT_EQ' 
        ? `Solución Implícita: <code>${implicitEqWithC} = 0</code>` 
        : `Solución Explícita y(x): <code>${fnExplicit}</code>`}
    `);

    // --- 9. INTERVALO DE VALIDEZ ---
    addStep('7. Intervalo de Validez', `<code>I = (${a}, ${b})</code> donde <code>x0 = ${x0} ∈ I</code>`);

    // --- 10. GRAFICACIÓN ---
    plotSolution(fnExplicit, implicitEqWithC, x0, y0, a, b, exprRaw);

  } catch (err) {
    showError('Ocurrió un error en el procesamiento simbólico de la ecuación.');
  }
}

// Función auxiliar para convertir la sintaxis de Algebrite a sintaxis compatible con function-plot / mathjs
// Función auxiliar para sanitizar la salida simbólica/numérica de Algebrite
function cleanForFunctionPlot(expr) {
  if (!expr) return '';
  
  return expr
    // 1. Eliminar los puntos suspensivos producidos por decimales periódicos de Algebrite (-0.888889... -> -0.888889)
    .replace(/\.\.\./g, '')
    
    // 2. Convertir logaritmos naturales (Algebrite usa log, function-plot usa ln)
    .replace(/\blog\b/g, 'ln')
    
    // 3. Convertir constantes e exponenciales
    .replace(/exp\(1\)/g, 'e')
    
    // 4. Corregir productos implícitos producidos por Algebrite (ej. "2 x" -> "2*x", "x y" -> "x*y")
    .replace(/(\d+)\s+([a-zA-Z])/g, '$1*$2')
    .replace(/([a-zA-Z])\s+([a-zA-Z])/g, '$1*$2')
    .replace(/\)\s+\(/g, ')*(')
    .replace(/(\d+)\s+\(/g, '$1*(')
    .replace(/\)\s+([a-zA-Z])/g, ')*$1')
    
    // 5. Eliminar espacios innecesarios
    .replace(/\s+/g, '')
    .trim();
}

function plotSolution(fnText, implicitText, x0, y0, a, b, originalExpr) {
  const containerWidth = plotContainer.clientWidth || 500;
  plotContainer.innerHTML = '';

  try {
    let dataConfig = [];

    // CASO A: Ecuación Implícita F(x,y) = 0
    if (fnText === 'IMPLICIT_EQ' || fnText.includes('Stop:')) {
      let cleanImplicit = cleanForFunctionPlot(implicitText);

      dataConfig.push({
        fn: cleanImplicit,
        fnType: 'implicit'
      });

    } else {
      // CASO B: Función Explícita y(x)
      let cleanFn = cleanForFunctionPlot(fnText);

      dataConfig.push({
        fn: cleanFn,
        graphType: 'polyline'
      });
    }

    // 2. Punto de la condición inicial (x0, y0)
    dataConfig.push({
      points: [[x0, y0]],
      fnType: 'points',
      graphType: 'scatter'
    });

    // 3. Renderizar gráfica
    functionPlot({
      target: '#plot',
      width: containerWidth,
      height: 420,
      grid: true,
      title: `dy/dx = ${originalExpr}`,
      xAxis: { domain: [a, b], label: 'x' },
      yAxis: { domain: [y0 - 5, y0 + 5], label: 'y' },
      data: dataConfig
    });

  } catch (err) {
    console.error("Error en Function Plot:", err);
    plotContainer.innerHTML = `
      <div class="alert-error">
        <strong>Error de graficación:</strong> No se pudo renderizar la curva en el dominio [${a}, ${b}]. Pruebe ajustando el intervalo.
      </div>`;
  }
}
function addStep(title, content) {
  const div = document.createElement('div');
  div.className = 'step-block';
  div.innerHTML = `<strong>${title}:</strong><br>${content}`;
  stepsOutput.appendChild(div);
}

function showError(msg) {
  stepsOutput.innerHTML = `<div class="alert-error"><strong>Atención:</strong> ${msg}</div>`;
  plotContainer.innerHTML = '';
}

solveBtn.addEventListener('click', processDifferentialEquation);
window.addEventListener('resize', processDifferentialEquation);

// Procesar al cargar
processDifferentialEquation();