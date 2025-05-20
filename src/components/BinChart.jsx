
import React from "react"
import { Doughnut } from "react-chartjs-2"
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js"

ChartJS.register(ArcElement, Tooltip, Legend)

export function BinChart({ fillLevel }) {
  const data = {
    labels: ["Lleno", "Vacío"],
    datasets: [
      {
        data: [fillLevel, 100 - fillLevel],
        backgroundColor: [
          fillLevel >= 80 ? "#ef4444" : "#22c55e",
          "#e2e8f0"
        ],
        borderColor: ["transparent", "transparent"],
        borderWidth: 1,
      },
    ],
  }

  const options = {
    cutout: "70%",
    plugins: {
      legend: {
        display: false
      }
    },
    maintainAspectRatio: false
  }

  return (
    <div className="relative h-32 w-32 mx-auto">
      <Doughnut data={data} options={options} />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xl font-bold ${
          fillLevel >= 80 ? "text-red-500" : "text-green-600"
        }`}>
          {Math.round(fillLevel)}%
        </span>
      </div>
    </div>
  )
}
